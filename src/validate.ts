import { stat } from "node:fs/promises";
import path from "node:path";
import { SKILL_FILE } from "./index.js";
import type { Skill } from "./manifest.js";

/**
 * Validates after checkout: fetch already proves repo/auth/ref; this proves the
 * manifest path is a skill directory with the required SKILL.md file.
 */
export async function validateSkillDirectory(sourceSkillDir: string, skill: Skill) {
    await assertDirectory(
        sourceSkillDir,
        `Skill path does not exist or is not a directory: ${skill.repoUrl}:${skill.path}`
    );

    await assertFile(
        path.join(sourceSkillDir, SKILL_FILE),
        `Skill is missing ${SKILL_FILE}: ${skill.repoUrl}:${skill.path}`
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
