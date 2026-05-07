import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export type SkillRegistryEntry = {
    id: string;
    upstreamPath: string;
    localPath: string;
};

export type RepoRegistryEntry = {
    repoUrl: string;
    skills: Record<string, SkillRegistryEntry>;
};

export type SkillsRegistry = Record<string, RepoRegistryEntry>;

export async function load(
    skillOrSkills: SkillRegistryEntry | readonly SkillRegistryEntry[],
    targetPath: string
) {
    const isSkillArray = Array.isArray(skillOrSkills);
    const skills = isSkillArray ? skillOrSkills : [skillOrSkills];
    if (skills.length === 0) {
        throw new Error("No skills provided to load()");
    }

    const target = path.resolve(process.cwd(), targetPath);

    if (!isSkillArray) {
        await copySkill(skills[0], target);
        return;
    }

    assertUniqueSkillIds(skills);
    await Promise.all(skills.map((skill) => copySkill(
        skill,
        path.join(target, ...getSafeSkillIdParts(skill.id))
    )));
}

/**
 * Keeps the generated registry as plain data while providing a tiny typed lookup
 * API for repo(...).skill(...) autocomplete.
 */
export function createSkillsRegistry<const Registry extends SkillsRegistry>(registry: Registry) {
    return {
        registry,

        repo<RepoName extends keyof Registry & string>(repoName: RepoName) {
            const repo = registry[repoName];

            return {
                ...repo,

                skill<SkillName extends keyof Registry[RepoName]["skills"] & string>(skillName: SkillName) {
                    return repo.skills[skillName] as Registry[RepoName]["skills"][SkillName];
                }
            };
        }
    };
}

async function copySkill(skill: SkillRegistryEntry, targetPath: string) {
    await assertDirectory(skill.localPath, `Skill source does not exist or is not a directory: ${skill.localPath}`);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await rm(targetPath, { recursive: true, force: true });
    await cp(skill.localPath, targetPath, { recursive: true, force: true });
}

async function assertDirectory(filePath: string, message: string) {
    try {
        const stats = await stat(filePath);
        if (!stats.isDirectory()) throw new Error(message);
    } catch {
        throw new Error(message);
    }
}

function assertUniqueSkillIds(skills: readonly SkillRegistryEntry[]) {
    const seenIds = new Set<string>();

    for (const skill of skills) {
        if (seenIds.has(skill.id)) {
            throw new Error(`Duplicate skill id passed to load(): ${skill.id}`);
        }
        seenIds.add(skill.id);
    }
}

function getSafeSkillIdParts(id: string) {
    if (id === "" || id.includes("\\") || path.posix.isAbsolute(id)) {
        throw new Error(`Invalid skill id: ${id}`);
    }

    const parts = id.split("/");
    if (parts.some((part) => part === "" || part === "." || part === "..")) {
        throw new Error(`Invalid skill id: ${id}`);
    }

    return parts;
}
