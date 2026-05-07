import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { MAX_CONCURRENT_CLONES } from "./index.js";
import { writeRegistry, type ClonedSkill } from "./generate.js";
import type { Skill, SkillsManifest } from "./manifest.js";
import {
    getFinalSkillDir,
    getLocalSkillDir,
    getSkillName,
    getSourceSkillDir,
    normalizeRepoPath
} from "./paths.js";
import { parseGitRepo } from "./repo.js";
import { validateSkillDirectory } from "./validate.js";

/**
 * Clones all skills with bounded concurrency, then writes registry.ts only after
 * every clone succeeds so the registry never points at missing installs.
 */
export async function cloneAndOverwrite(skillManifest: SkillsManifest): Promise<ClonedSkill[]> {
    const clonedSkills: ClonedSkill[] = [];

    for (let index = 0; index < skillManifest.skills.length; index += MAX_CONCURRENT_CLONES) {
        const batch = skillManifest.skills.slice(index, index + MAX_CONCURRENT_CLONES);
        clonedSkills.push(...await Promise.all(batch.map((skill) => cloneAndOverwriteSkill(skill))));
    }

    return clonedSkills;
}

/**
 * Sparse-checks out one skill into a temp Git repo, validates it, then copies
 * only the skill contents into skills-manifests/$owner/$repoName/$skillName.
 */
async function cloneAndOverwriteSkill(skill: Skill): Promise<ClonedSkill> {
    console.log(`Loading skill: ${skill.repoUrl}:${skill.path}`);

    const { owner, repoName } = parseGitRepo(skill.repoUrl);
    const skillPath = normalizeRepoPath(skill.path);
    const skillName = getSkillName(skillPath);

    const finalDir = getFinalSkillDir(owner, repoName, skillName);
    const finalParentDir = path.dirname(finalDir);
    const tempCloneDir = await mkdtemp(
        path.join(os.tmpdir(), `skills-manifest-${owner}-${repoName}-${skillName}-`)
    );
    const tempOutputDir = path.join(
        finalParentDir,
        `.${skillName}.tmp-${process.pid}-${randomUUID()}`
    );

    try {
        try {
            await mkdir(finalParentDir, { recursive: true });

            const git = simpleGit(tempCloneDir);

            // simple-git has no first-class sparse checkout API; raw passes safe argv to git.
            await git.raw(["init"]);
            await git.raw(["remote", "add", "origin", skill.repoUrl]);
            await git.raw(["sparse-checkout", "init", "--cone"]);
            await git.raw(["sparse-checkout", "set", "--", skillPath]);
            await git.raw([
                "fetch",
                "--depth",
                "1",
                "--filter=blob:none",
                "origin",
                skill.ref
            ]);
            await git.raw(["checkout", "--detach", "FETCH_HEAD"]);

            const sourceSkillDir = getSourceSkillDir(tempCloneDir, skillPath);
            await validateSkillDirectory(sourceSkillDir, skill);

            await rm(tempOutputDir, { recursive: true, force: true });
            await cp(sourceSkillDir, tempOutputDir, { recursive: true, force: true });

            await rm(finalDir, { recursive: true, force: true });
            await rename(tempOutputDir, finalDir);

            return {
                owner,
                repoName,
                repoUrl: skill.repoUrl,
                skillName,
                originalPath: skillPath,
                localDir: getLocalSkillDir(owner, repoName, skillName)
            };
        } catch (error) {
            throw new Error(
                `Failed to clone skill ${skill.repoUrl}:${skill.path}@${skill.ref}: ${formatError(error)}`,
                { cause: error }
            );
        }
    } finally {
        await rm(tempCloneDir, { recursive: true, force: true });
        await rm(tempOutputDir, { recursive: true, force: true });
    }
}

function formatError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
