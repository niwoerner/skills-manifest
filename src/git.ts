import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit, type SimpleGit } from "simple-git";
import { MAX_CONCURRENT_CLONES, SKILL_FILE } from "./index.js";
import type { ClonedSkill } from "./generate.js";
import type { Skill, SkillsManifest } from "./manifest.js";
import {
    getFinalSkillDir,
    getLocalSkillDir,
    getSkillName,
    getSourceSkillDir,
    getWildcardSkillId,
    parseSkillPathSelector,
    type SkillPathSelector
} from "./paths.js";
import { parseGitRepo } from "./repo.js";
import { validateSkillDirectory } from "./validate.js";

const STORED_SKILL_FILE = "SKILL.manifest.md";

type ResolvedSkill = {
    upstreamPath: string;
    skillName: string;
    id: string;
    installPath: string;
};

type FetchedSkillRepo = {
    owner: string;
    repoName: string;
    resolvedCommit: string;
    git: SimpleGit;
    tempCloneDir: string;
};

/**
 * Resolves manifest entries to concrete skills and commits without writing files.
 * Used by validate and by generate's lock data.
 */
export async function resolveManifestSkills(skillManifest: SkillsManifest): Promise<ClonedSkill[]> {
    const clonedSkills: ClonedSkill[] = [];

    for (let index = 0; index < skillManifest.skills.length; index += MAX_CONCURRENT_CLONES) {
        const batch = skillManifest.skills.slice(index, index + MAX_CONCURRENT_CLONES);
        const resolvedBatch = await Promise.all(batch.map((skill) => resolveManifestSkill(skill)));
        clonedSkills.push(...resolvedBatch.flat());
    }

    assertUniqueRegistryKeys(clonedSkills);

    return clonedSkills;
}

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

async function resolveManifestSkill(skill: Skill): Promise<ClonedSkill[]> {
    return withFetchedSkillRepo(skill, async (fetchedRepo) => {
        const selector = parseSkillPathSelector(skill.path);
        const resolvedSkills = await resolveSkills(fetchedRepo.git, selector, skill);

        return resolvedSkills.map((resolvedSkill) => toClonedSkill({
            ...fetchedRepo,
            skill,
            resolvedSkill
        }));
    });
}

/**
 * Sparse-checks out one exact skill or one wildcard-selected set of skills into
 * a temp Git repo, validates each skill, then copies only the skill contents into
 * skills-manifests/$owner/$repoName/<install path>.
 */
async function cloneAndOverwriteSkill(skill: Skill): Promise<ClonedSkill[]> {
    console.log(`Loading skill: ${skill.repoUrl}:${skill.path}`);

    const tempOutputDirs: string[] = [];

    try {
        try {
            return await withFetchedSkillRepo(skill, async (fetchedRepo) => {
                const selector = parseSkillPathSelector(skill.path);
                const resolvedSkills = await resolveSkills(fetchedRepo.git, selector, skill);

                await fetchedRepo.git.raw(["sparse-checkout", "init", "--cone"]);
                await fetchedRepo.git.raw([
                    "sparse-checkout",
                    "set",
                    "--",
                    ...resolvedSkills.map((resolvedSkill) => resolvedSkill.upstreamPath)
                ]);
                await fetchedRepo.git.raw(["checkout", "--detach", "FETCH_HEAD"]);

                const clonedSkills: ClonedSkill[] = [];
                for (const resolvedSkill of resolvedSkills) {
                    const clonedSkill = await copyResolvedSkill({
                        ...fetchedRepo,
                        skill,
                        resolvedSkill,
                        tempOutputDirs
                    });
                    clonedSkills.push(clonedSkill);
                }

                return clonedSkills;
            });
        } catch (error) {
            throw new Error(
                `Failed to clone skill ${skill.repoUrl}:${skill.path}@${skill.ref}: ${formatError(error)}`,
                { cause: error }
            );
        }
    } finally {
        await Promise.all(tempOutputDirs.map((tempOutputDir) => rm(tempOutputDir, { recursive: true, force: true })));
    }
}

async function withFetchedSkillRepo<T>(skill: Skill, fn: (fetchedRepo: FetchedSkillRepo) => Promise<T>): Promise<T> {
    const { owner, repoName } = parseGitRepo(skill.repoUrl);
    const tempCloneDir = await mkdtemp(
        path.join(os.tmpdir(), `skills-manifest-${owner}-${repoName}-`)
    );

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

        const resolvedCommit = (await git.raw(["rev-parse", "FETCH_HEAD"])).trim();

        return await fn({ owner, repoName, resolvedCommit, git, tempCloneDir });
    } finally {
        await rm(tempCloneDir, { recursive: true, force: true });
    }
}

async function resolveSkills(
    git: SimpleGit,
    selector: SkillPathSelector,
    skill: Skill
): Promise<ResolvedSkill[]> {
    if (selector.kind === "exact") {
        await validateSkillEntrypointInTree(git, selector.path, skill);

        const skillName = getSkillName(selector.path);
        return [
            {
                upstreamPath: selector.path,
                skillName,
                id: skillName,
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

async function validateSkillEntrypointInTree(git: SimpleGit, skillPath: string, skill: Skill) {
    const files = await listTreeFiles(git, skillPath);
    if (!files.includes(`${skillPath}/${SKILL_FILE}`)) {
        throw new Error(`Skill is missing ${SKILL_FILE}: ${skill.repoUrl}:${skill.path}`);
    }
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

        const id = getWildcardSkillId(selector.basePath, skillPath);
        if (!selector.recursive && id.includes("/")) continue;

        skillPaths.add(skillPath);
    }

    return [...skillPaths].sort().map((skillPath) => ({
        upstreamPath: skillPath,
        skillName: getSkillName(skillPath),
        id: getWildcardSkillId(selector.basePath, skillPath),
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
    if (filePath === SKILL_FILE) return "";

    const suffix = `/${SKILL_FILE}`;
    if (!filePath.endsWith(suffix)) return undefined;

    return filePath.slice(0, -suffix.length);
}

async function copyResolvedSkill(args: FetchedSkillRepo & {
    skill: Skill;
    resolvedSkill: ResolvedSkill;
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

    const sourceSkillDir = getSourceSkillDir(tempCloneDir, resolvedSkill.upstreamPath);
    await validateSkillDirectory(sourceSkillDir, { ...skill, path: resolvedSkill.upstreamPath });

    await rm(tempOutputDir, { recursive: true, force: true });
    await cp(sourceSkillDir, tempOutputDir, { recursive: true, force: true });
    await rename(
        path.join(tempOutputDir, SKILL_FILE),
        path.join(tempOutputDir, STORED_SKILL_FILE)
    );

    await rm(finalDir, { recursive: true, force: true });
    await rename(tempOutputDir, finalDir);

    return toClonedSkill(args);
}

function toClonedSkill(args: FetchedSkillRepo & { skill: Skill; resolvedSkill: ResolvedSkill }): ClonedSkill {
    const { owner, repoName, resolvedCommit, skill, resolvedSkill } = args;

    return {
        id: resolvedSkill.id,
        owner,
        repoName,
        repoUrl: skill.repoUrl,
        ref: skill.ref,
        resolvedCommit,
        manifestPath: skill.path,
        skillName: resolvedSkill.skillName,
        upstreamPath: resolvedSkill.upstreamPath,
        localDir: getLocalSkillDir(owner, repoName, resolvedSkill.installPath)
    };
}

function assertUniqueRegistryKeys(clonedSkills: readonly ClonedSkill[]) {
    const seenSkills = new Set<string>();

    for (const skill of clonedSkills) {
        const skillKey = `${skill.owner}/${skill.repoName}/${skill.id}`;
        if (seenSkills.has(skillKey)) {
            throw new Error(`Duplicate skill destination in registry: ${skillKey}`);
        }
        seenSkills.add(skillKey);
    }
}

function formatError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
