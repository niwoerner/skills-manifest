import path from "node:path";
import { pathToFileURL } from "node:url";
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
    const skillsManifestPath = path.join(process.cwd(), "skills-manifest.json");
    const manifest = await loadSkillsManifest(skillsManifestPath);

    if (command === "generate") {
        const clonedSkills = await cloneAndOverwrite(manifest);
        await removeStaleSkills(clonedSkills);
        await writeRegistry(clonedSkills);
        await writeSkillsLock(clonedSkills);
        return;
    }

    if (command === "validate") {
        const warnings = await validateGeneratedSkills(manifest);
        if (warnings.length > 0) {
            console.warn(`Warning: skills-manifest generated files are out of date. Run skills-manifest generate.\n${warnings.join("\n")}`);
        }
        return;
    }

    throw new Error(`Unknown command: ${command}. Expected "generate" or "validate".`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
