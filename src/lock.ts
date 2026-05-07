import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClonedSkill } from "./generate.js";
import { LOCK_FILENAME, SKILLS_MANIFESTS_DIR } from "./index.js";

export type SkillsLock = {
    version: 1;
    generatedAt: string;
    skills: ClonedSkill[];
};

export function createSkillsLock(skills: readonly ClonedSkill[]): SkillsLock {
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        skills: skills.map(orderLockedSkill)
    };
}

export async function writeSkillsLock(
    skills: readonly ClonedSkill[],
    outputDir = path.join(process.cwd(), SKILLS_MANIFESTS_DIR)
) {
    await mkdir(outputDir, { recursive: true });

    const lockPath = path.join(outputDir, LOCK_FILENAME);
    const tempLockPath = path.join(
        outputDir,
        `.skills-lock.tmp-${process.pid}-${randomUUID()}.json`
    );

    try {
        await writeFile(tempLockPath, `${JSON.stringify(createSkillsLock(skills), null, 2)}\n`, "utf8");
        await rename(tempLockPath, lockPath);
    } finally {
        await rm(tempLockPath, { force: true });
    }
}

export async function removeStaleSkills(currentSkills: readonly ClonedSkill[]) {
    let lock: SkillsLock;
    try {
        lock = await loadSkillsLock();
    } catch (error) {
        if (error instanceof Error && error.message.includes("not found")) return;
        throw error;
    }

    const currentLocalDirs = new Set(currentSkills.map((skill) => skill.localDir));
    const outputDir = path.resolve(process.cwd(), SKILLS_MANIFESTS_DIR);

    await Promise.all(lock.skills
        .filter((skill) => !currentLocalDirs.has(skill.localDir))
        .map((skill) => rm(resolveSafeLocalDir(outputDir, skill.localDir), { recursive: true, force: true })));
}

export async function loadSkillsLock(
    lockPath = path.join(process.cwd(), SKILLS_MANIFESTS_DIR, LOCK_FILENAME)
): Promise<SkillsLock> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(await readFile(lockPath, "utf8"));
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`${lockPath} is not valid JSON: ${error.message}`);
        }

        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ENOENT"
        ) {
            throw new Error(`${lockPath} not found. Run skills-manifest generate first.`);
        }

        throw error;
    }

    if (!isSkillsLock(parsed)) {
        throw new Error(`Invalid ${lockPath}: expected skills-manifest lock file version 1`);
    }

    return {
        ...parsed,
        skills: parsed.skills.map(normalizeLockedSkill)
    };
}

function resolveSafeLocalDir(outputDir: string, localDir: string) {
    const resolved = path.resolve(outputDir, ...localDir.split("/"));
    if (resolved !== outputDir && !resolved.startsWith(`${outputDir}${path.sep}`)) {
        throw new Error(`Invalid localDir in ${LOCK_FILENAME}: ${localDir}`);
    }

    return resolved;
}

function orderLockedSkill(skill: ClonedSkill): ClonedSkill {
    return {
        id: skill.id,
        owner: skill.owner,
        repoName: skill.repoName,
        repoUrl: skill.repoUrl,
        ref: skill.ref,
        resolvedCommit: skill.resolvedCommit,
        manifestPath: skill.manifestPath,
        skillName: skill.skillName,
        upstreamPath: skill.upstreamPath,
        localDir: skill.localDir
    };
}

function normalizeLockedSkill(skill: ClonedSkill | (Omit<ClonedSkill, "id" | "upstreamPath"> & { registryKey: string; originalPath: string; })) {
    if ("id" in skill && "upstreamPath" in skill) {
        return orderLockedSkill(skill);
    }

    return orderLockedSkill({
        id: skill.registryKey,
        owner: skill.owner,
        repoName: skill.repoName,
        repoUrl: skill.repoUrl,
        ref: skill.ref,
        resolvedCommit: skill.resolvedCommit,
        manifestPath: skill.manifestPath,
        skillName: skill.skillName,
        upstreamPath: skill.originalPath,
        localDir: skill.localDir
    });
}

function isSkillsLock(value: unknown): value is SkillsLock {
    if (!value || typeof value !== "object") return false;

    const lock = value as { version?: unknown; generatedAt?: unknown; skills?: unknown };
    return lock.version === 1 &&
        typeof lock.generatedAt === "string" &&
        Array.isArray(lock.skills) &&
        lock.skills.every(isLockedSkill);
}

function isLockedSkill(value: unknown): value is ClonedSkill {
    if (!value || typeof value !== "object") return false;

    const skill = value as Record<string, unknown>;
    return [
        "owner",
        "repoName",
        "repoUrl",
        "ref",
        "resolvedCommit",
        "manifestPath",
        "skillName",
        "localDir"
    ].every((key) => typeof skill[key] === "string") &&
        ((typeof skill.id === "string" && typeof skill.upstreamPath === "string") ||
            (typeof skill.registryKey === "string" && typeof skill.originalPath === "string"));
}
