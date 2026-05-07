import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { REGISTRY_FILENAME, SKILLS_MANIFESTS_DIR } from "./index.js";

export type ClonedSkill = {
    owner: string;
    repoName: string;
    repoUrl: string;
    ref: string;
    resolvedCommit: string;
    manifestPath: string;
    skillName: string;
    registryKey: string;
    originalPath: string;
    localDir: string;
};

type RegistryRepo = {
    name: string;
    repoUrl: string;
    skills: ClonedSkill[];
};

/**
 * Writes registry.ts atomically so failed generation never leaves a partial
 * registry next to successfully cloned skills.
 */
export async function writeRegistry(
    clonedSkills: readonly ClonedSkill[],
    outputDir = path.join(process.cwd(), SKILLS_MANIFESTS_DIR)
) {
    await mkdir(outputDir, { recursive: true });

    const registryPath = path.join(outputDir, REGISTRY_FILENAME);
    const tempRegistryPath = path.join(
        outputDir,
        `.registry.tmp-${process.pid}-${randomUUID()}.ts`
    );

    try {
        await writeFile(tempRegistryPath, generateRegistry(clonedSkills), "utf8");
        await rename(tempRegistryPath, registryPath);
    } finally {
        await rm(tempRegistryPath, { force: true });
    }
}

/**
 * Generates TypeScript by hand because localPath must contain executable
 * `new URL(..., import.meta.url)` code, not JSON data.
 */
export function generateRegistry(clonedSkills: readonly ClonedSkill[]) {
    const repos = groupByRepo(clonedSkills);

    let out = `import { createSkillsApi } from "skills-manifest/api";

export const registry = {
`;

    for (const repo of repos) {
        out += `    ${JSON.stringify(repo.name)}: {
        repoUrl: ${JSON.stringify(repo.repoUrl)},

        skills: {
`;

        for (const skill of repo.skills) {
            out += `            ${JSON.stringify(skill.registryKey)}: {
                originalPath: ${JSON.stringify(skill.originalPath)},

                localPath: new URL(
                    ${JSON.stringify(`./${skill.localDir}/`)},
                    import.meta.url
                ).pathname,
            },
`;
        }

        out += `        },
    },
`;
    }

    out += `} as const;

export const skills = createSkillsApi(registry);

export type Registry = typeof registry;
export type RepoName = keyof Registry;
export type SkillName<R extends RepoName> = keyof Registry[R]["skills"];
`;

    return out;
}

function groupByRepo(clonedSkills: readonly ClonedSkill[]) {
    const repos = new Map<string, RegistryRepo>();
    const seenSkills = new Set<string>();

    for (const skill of clonedSkills) {
        const repoName = `${skill.owner}/${skill.repoName}`;
        const skillKey = `${repoName}/${skill.registryKey}`;

        if (seenSkills.has(skillKey)) {
            throw new Error(`Duplicate skill destination in registry: ${skillKey}`);
        }
        seenSkills.add(skillKey);

        let repo = repos.get(repoName);
        if (!repo) {
            repo = {
                name: repoName,
                repoUrl: skill.repoUrl,
                skills: []
            };
            repos.set(repoName, repo);
        }

        repo.skills.push(skill);
    }

    return [...repos.values()];
}
