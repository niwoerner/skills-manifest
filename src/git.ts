import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import { MAX_CONCURRENT_CLONES, SKILL_ENTRYPOINT } from "./index.js";
import type { ClonedSkill } from "./generate.js";
import type { Skill, SkillsManifest } from "./manifest.js";
import {
    getFinalSkillDir,
    getLocalSkillDir,
    getSkillName,
    getSourceSkillDir,
    getWildcardRegistryKey,
    parseSkillPathSelector,
    type SkillPathSelector
} from "./paths.js";
import { parseGitRepo } from "./repo.js";
import { validateSkillDirectory } from "./validate.js";

type ResolvedSkill = {
    originalPath: string;
    skillName: string;
    registryKey: string;
    installPath: string;
};

/**
 * Clones all skills with bounded concurrency, then returns them only after every
 * clone succeeds so callers never generate a registry that points at missing installs.
 */
export async function cloneAndOverwrite(skillManifest: SkillsManifest): Promise<ClonedSkill[]> {
    const clonedSkills: ClonedSkill[] = [];

    for (let index = 0; index < skillManifest.skills.length; index += MAX_CONCURRENT_CLONES) {
        const batch = skillManifest.skills.slice(index, index + MAX_CONCURRENT_CLONES);
        const clonedBatch = await Promise.all(batch.map((skill) => cloneAndOverwriteSkill(skill)));
        clonedSkills.push(...clonedBatch.flat());
    }

    assertUniqueRegistryKeys(clonedSkills);

    return clonedSkills;
}

/**
 * Sparse-checks out one exact skill or one wildcard-selected set of skills into
 * a temp Git repo, validates each skill, then copies only the skill contents into
 * skills-manifests/$owner/$repoName/<install path>.
 */
async function cloneAndOverwriteSkill(skill: Skill): Promise<ClonedSkill[]> {
    console.log(`Loading skill: ${skill.repoUrl}:${skill.path}`);

    const { owner, repoName } = parseGitRepo(skill.repoUrl);
    const selector = parseSkillPathSelector(skill.path);
    const tempCloneDir = await mkdtemp(
        path.join(os.tmpdir(), `skills-manifest-${owner}-${repoName}-`)
    );
    const tempOutputDirs: string[] = [];

    try {
        try {
            const git = simpleGit(tempCloneDir);

            await git.raw(["init"]);
            await git.raw(["remote", "add", "origin", skill.repoUrl]);
            await git.raw([
                "fetch",
                "--depth",
                "1",
                "--filter=blob:none",
                "origin",
                skill.ref
            ]);

            const resolvedSkills = await resolveSkills(git, selector, skill);

            await git.raw(["sparse-checkout", "init", "--cone"]);
            await git.raw([
                "sparse-checkout",
                "set",
                "--",
                ...resolvedSkills.map((resolvedSkill) => resolvedSkill.originalPath)
            ]);
            await git.raw(["checkout", "--detach", "FETCH_HEAD"]);

            const clonedSkills: ClonedSkill[] = [];
            for (const resolvedSkill of resolvedSkills) {
                const clonedSkill = await copyResolvedSkill({
                    owner,
                    repoName,
                    skill,
                    resolvedSkill,
                    tempCloneDir,
                    tempOutputDirs
                });
                clonedSkills.push(clonedSkill);
            }

            return clonedSkills;
        } catch (error) {
            throw new Error(
                `Failed to clone skill ${skill.repoUrl}:${skill.path}@${skill.ref}: ${formatError(error)}`,
                { cause: error }
            );
        }
    } finally {
        await rm(tempCloneDir, { recursive: true, force: true });
        await Promise.all(tempOutputDirs.map((tempOutputDir) => rm(tempOutputDir, { recursive: true, force: true })));
    }
}

async function resolveSkills(
    git: SimpleGit,
    selector: SkillPathSelector,
    skill: Skill
): Promise<ResolvedSkill[]> {
    if (selector.kind === "exact") {
        const skillName = getSkillName(selector.path);
        return [
            {
                originalPath: selector.path,
                skillName,
                registryKey: skillName,
                installPath: skillName
            }
        ];
    }

    const resolvedSkills = await discoverWildcardSkills(git, selector);
    if (resolvedSkills.length === 0) {
        throw new Error(`No valid skills matched wildcard path: ${skill.repoUrl}:${skill.path}`);
    }

    return resolvedSkills;
}

async function discoverWildcardSkills(
    git: SimpleGit,
    selector: Extract<SkillPathSelector, { kind: "wildcard" }>
): Promise<ResolvedSkill[]> {
    const files = await listTreeFiles(git, selector.basePath);
    const skillPaths = new Set<string>();

    for (const file of files) {
        const skillPath = getSkillDirFromEntrypoint(file);
        if (skillPath === undefined || skillPath === "") continue;

        const registryKey = getWildcardRegistryKey(selector.basePath, skillPath);
        if (!selector.recursive && registryKey.includes("/")) continue;

        skillPaths.add(skillPath);
    }

    return [...skillPaths].sort().map((skillPath) => ({
        originalPath: skillPath,
        skillName: getSkillName(skillPath),
        registryKey: getWildcardRegistryKey(selector.basePath, skillPath),
        installPath: skillPath
    }));
}

async function listTreeFiles(git: SimpleGit, basePath: string) {
    const args = ["ls-tree", "-r", "--name-only", "FETCH_HEAD"];
    if (basePath !== "") {
        args.push("--", basePath);
    }

    const output = await git.raw(args);
    return output.split(/\r?\n/).filter(Boolean);
}

function getSkillDirFromEntrypoint(filePath: string) {
    if (filePath === SKILL_ENTRYPOINT) return "";

    const suffix = `/${SKILL_ENTRYPOINT}`;
    if (!filePath.endsWith(suffix)) return undefined;

    return filePath.slice(0, -suffix.length);
}

async function copyResolvedSkill(args: {
    owner: string;
    repoName: string;
    skill: Skill;
    resolvedSkill: ResolvedSkill;
    tempCloneDir: string;
    tempOutputDirs: string[];
}): Promise<ClonedSkill> {
    const { owner, repoName, skill, resolvedSkill, tempCloneDir, tempOutputDirs } = args;
    const finalDir = getFinalSkillDir(owner, repoName, resolvedSkill.installPath);
    const finalParentDir = path.dirname(finalDir);
    const tempOutputDir = path.join(
        finalParentDir,
        `.${resolvedSkill.skillName}.tmp-${process.pid}-${randomUUID()}`
    );
    tempOutputDirs.push(tempOutputDir);

    await mkdir(finalParentDir, { recursive: true });

    const sourceSkillDir = getSourceSkillDir(tempCloneDir, resolvedSkill.originalPath);
    await validateSkillDirectory(sourceSkillDir, { ...skill, path: resolvedSkill.originalPath });

    await rm(tempOutputDir, { recursive: true, force: true });
    await cp(sourceSkillDir, tempOutputDir, { recursive: true, force: true });

    await rm(finalDir, { recursive: true, force: true });
    await rename(tempOutputDir, finalDir);

    return {
        owner,
        repoName,
        repoUrl: skill.repoUrl,
        skillName: resolvedSkill.skillName,
        registryKey: resolvedSkill.registryKey,
        originalPath: resolvedSkill.originalPath,
        localDir: getLocalSkillDir(owner, repoName, resolvedSkill.installPath)
    };
}

function assertUniqueRegistryKeys(clonedSkills: readonly ClonedSkill[]) {
    const seenSkills = new Set<string>();

    for (const skill of clonedSkills) {
        const skillKey = `${skill.owner}/${skill.repoName}/${skill.registryKey}`;
        if (seenSkills.has(skillKey)) {
            throw new Error(`Duplicate skill destination in registry: ${skillKey}`);
        }
        seenSkills.add(skillKey);
    }
}

function formatError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
