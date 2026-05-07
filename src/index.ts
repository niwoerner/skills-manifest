import path from "node:path";
import { pathToFileURL } from "node:url";
import { cloneAndOverwrite } from "./git.js";
import { loadSkillsManifest } from "./manifest.js";
import { writeRegistry } from "./generate.js";

/** Directory where cloned skill contents and the generated registry are written. */
export const SKILLS_MANIFESTS_DIR = "skills-manifests";

/** Generated TypeScript file that exposes installed skills with type-safe lookup. */
export const REGISTRY_FILENAME = "registry.ts";

/** Required file that identifies a valid agent skill directory. */
export const SKILL_ENTRYPOINT = "SKILL.md";

/** Max number of Git clone/fetch operations to run at once. */
export const MAX_CONCURRENT_CLONES = 5;

async function main() {
    const skillsManifestPath = path.join(process.cwd(), "skills-manifest.json");
    const manifest = await loadSkillsManifest(skillsManifestPath);

    const clonedSkills = await cloneAndOverwrite(manifest);
    await writeRegistry(clonedSkills);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
