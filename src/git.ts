import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, rename, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { simpleGit } from "simple-git";
import { writeRegistry, type ClonedSkill } from "./generate.js";
import type { Skill, SkillsManifest } from "./manifest.js";

/**
 * Clones all skills concurrently, then writes registry.ts only after every
 * clone succeeds so the registry never points at missing installs.
 */
export async function cloneAndOverwrite(skillManifest: SkillsManifest) {
    const clonedSkills = await Promise.all(
        skillManifest.skills.map((skill) => cloneAndOverwriteSkill(skill))
    );

    await writeRegistry(clonedSkills);
}

/**
 * Sparse-checks out one skill into a temp Git repo, validates it, then copies
 * only the skill contents into skills-manifests/$owner/$repo/$skill-name.
 */
async function cloneAndOverwriteSkill(skill: Skill): Promise<ClonedSkill> {
    console.log(`Loading skill: ${skill.repo}:${skill.path}`);
    const { owner, repo } = parseGitRepo(skill.repo);
    const skillPath = normalizeRepoPath(skill.path);
    const skillName = path.posix.basename(skillPath);

    const finalDir = path.join(
        process.cwd(),
        "skills-manifests",
        owner,
        repo,
        skillName
    );
    const finalParentDir = path.dirname(finalDir);
    const tempCloneDir = await mkdtemp(
        path.join(os.tmpdir(), `skills-manifest-${owner}-${repo}-${skillName}-`)
    );
    const tempOutputDir = path.join(
        finalParentDir,
        `.${skillName}.tmp-${process.pid}-${randomUUID()}`
    );

    try {
        await mkdir(finalParentDir, { recursive: true });

        const git = simpleGit(tempCloneDir);

        // simple-git has no first-class sparse checkout API; raw passes safe argv to git.
        await git.raw(["init"]);
        await git.raw(["remote", "add", "origin", skill.repo]);
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

        const sourceSkillDir = path.join(tempCloneDir, ...skillPath.split("/"));
        await validateSkillDirectory(sourceSkillDir, skill);

        await rm(tempOutputDir, { recursive: true, force: true });
        await cp(sourceSkillDir, tempOutputDir, { recursive: true, force: true });

        await rm(finalDir, { recursive: true, force: true });
        await rename(tempOutputDir, finalDir);

        return {
            owner,
            repo,
            repoUrl: skill.repo,
            skillName,
            originalPath: skillPath,
            localDir: `${owner}/${repo}/${skillName}`
        };
    } finally {
        await rm(tempCloneDir, { recursive: true, force: true });
        await rm(tempOutputDir, { recursive: true, force: true });
    }
}

/**
 * Validates after checkout: fetch already proves repo/auth/ref; this proves the
 * manifest path is a skill directory with the required SKILL.md entrypoint.
 */
async function validateSkillDirectory(sourceSkillDir: string, skill: Skill) {
    await assertDirectory(
        sourceSkillDir,
        `Skill path does not exist or is not a directory: ${skill.repo}:${skill.path}`
    );

    await assertFile(
        path.join(sourceSkillDir, "SKILL.md"),
        `Skill is missing SKILL.md: ${skill.repo}:${skill.path}`
    );
}

async function assertDirectory(filePath: string, message: string) {
    try {
        const stats = await stat(filePath);
        if (!stats.isDirectory()) throw new Error(message);
    } catch {
        throw new Error(message);
    }
}

async function assertFile(filePath: string, message: string) {
    try {
        const stats = await stat(filePath);
        if (!stats.isFile()) throw new Error(message);
    } catch {
        throw new Error(message);
    }
}

/**
 * Git paths are POSIX-style; normalize user input and reject absolute/traversal
 * paths before passing them to sparse checkout or filesystem operations.
 */
function normalizeRepoPath(repoPath: string) {
    const normalized = path.posix.normalize(repoPath.replaceAll("\\", "/"));

    if (normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
        throw new Error(`Invalid skill path: ${repoPath}`);
    }

    return normalized;
}

/**
 * Extracts owner/repo from HTTPS and SSH Git URLs so installs have a stable,
 * predictable destination path independent of URL style.
 */
function parseGitRepo(repoUrl: string) {
    const withoutTrailingSlash = repoUrl.replace(/\/+$/, "");
    const withoutGitSuffix = withoutTrailingSlash.replace(/\.git$/, "");

    let repoPath: string;

    const scpLikeMatch = withoutGitSuffix.match(/^[^@/:]+@[^:]+:(.+)$/);
    if (scpLikeMatch) {
        repoPath = scpLikeMatch[1];
    } else {
        try {
            const url = new URL(withoutGitSuffix);
            repoPath = url.pathname.replace(/^\/+/, "");
        } catch {
            repoPath = withoutGitSuffix;
        }
    }

    const parts = repoPath.split("/").filter(Boolean);
    if (parts.length < 2) {
        throw new Error(`Could not parse owner/repo from repo URL: ${repoUrl}`);
    }

    return {
        owner: parts[parts.length - 2],
        repo: parts[parts.length - 1]
    };
}
