#!/usr/bin/env node

import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloneAndOverwrite } from "./git.js";
import { loadSkillsManifest } from "./manifest.js";
import { validateGeneratedSkills } from "./check.js";
import { writeRegistry } from "./generate.js";
import { removeStaleSkills, writeSkillsLock } from "./lock.js";

/** Directory where cloned skill contents and the generated registry are written. */
export const SKILLS_MANIFESTS_DIR = "skills-manifests";

/** Generated TypeScript file that exposes installed skills with type-safe lookup. */
export const REGISTRY_FILENAME = "registry.ts";

/** Generated JSON file that records the resolved skill commits and paths. */
export const LOCK_FILENAME = "skills-lock.json";

/** Required file that identifies a valid agent skill directory. */
export const SKILL_ENTRYPOINT = "SKILL.md";

/** Max number of Git clone/fetch operations to run at once. */
export const MAX_CONCURRENT_CLONES = 5;

async function main() {
    const command = process.argv[2] ?? "generate";

    if (command === "--help" || command === "-h" || process.argv[3] === "--help" || process.argv[3] === "-h") {
        printHelp();
        return;
    }

    if (command !== "generate" && command !== "validate") {
        throw new Error(`Unknown command: ${command}. Expected "generate" or "validate".`);
    }

    const skillsManifestPath = path.resolve(process.cwd(), process.argv[3] ?? "skills-manifest.json");
    const manifest = await loadSkillsManifest(skillsManifestPath);

    if (command === "generate") {
        const clonedSkills = await cloneAndOverwrite(manifest);
        await removeStaleSkills(clonedSkills);
        await writeRegistry(clonedSkills);
        await writeSkillsLock(clonedSkills);
        return;
    }

    const warnings = await validateGeneratedSkills(manifest);
    if (warnings.length > 0) {
        console.warn(`Warning: skills-manifest generated files are out of date. Run skills-manifest generate.\n${warnings.join("\n")}`);
    }
}

function printHelp() {
    console.log(`Usage: skills-manifest [generate|validate] [skills-manifest.json]

Commands:
  generate    Install skills, write registry.ts, and write skills-lock.json
  validate    Check generated skills against the manifest and lock file

If omitted, the command defaults to generate and the manifest defaults to ./skills-manifest.json.`);
}

function isMain() {
    if (!process.argv[1]) return false;

    try {
        return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
}

if (isMain()) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
