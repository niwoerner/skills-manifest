import type { ClonedSkill } from "./generate.js";
import { resolveManifestSkills } from "./git.js";
import { loadSkillsLock } from "./lock.js";
import type { SkillsManifest } from "./manifest.js";

export async function validateGeneratedSkills(manifest: SkillsManifest): Promise<string[]> {
    const lock = await loadSkillsLock();
    const currentSkills = await resolveManifestSkills(manifest);

    return compareSkills(lock.skills, currentSkills);
}

function compareSkills(lockedSkills: readonly ClonedSkill[], currentSkills: readonly ClonedSkill[]) {
    const locked = new Map(lockedSkills.map((skill) => [getSkillKey(skill), skill]));
    const current = new Map(currentSkills.map((skill) => [getSkillKey(skill), skill]));
    const warnings: string[] = [];

    for (const [key, currentSkill] of current) {
        const lockedSkill = locked.get(key);
        if (!lockedSkill) {
            warnings.push(`Added skill: ${describeSkill(currentSkill)}`);
            continue;
        }

        if (lockedSkill.resolvedCommit !== currentSkill.resolvedCommit) {
            warnings.push(
                `Updated ref for ${currentSkill.repoUrl} ${currentSkill.ref}: ${lockedSkill.resolvedCommit} -> ${currentSkill.resolvedCommit}`
            );
        }

        if (lockedSkill.originalPath !== currentSkill.originalPath || lockedSkill.localDir !== currentSkill.localDir) {
            warnings.push(`Changed skill: ${describeSkill(currentSkill)}`);
        }
    }

    for (const [key, lockedSkill] of locked) {
        if (!current.has(key)) {
            warnings.push(`Removed skill: ${describeSkill(lockedSkill)}`);
        }
    }

    return [...new Set(warnings)];
}

function getSkillKey(skill: ClonedSkill) {
    return `${skill.repoUrl}\0${skill.ref}\0${skill.manifestPath}\0${skill.registryKey}`;
}

function describeSkill(skill: ClonedSkill) {
    return `${skill.repoUrl}:${skill.manifestPath} -> ${skill.registryKey} (${skill.originalPath})`;
}
