import path from "node:path";
import { cloneAndOverwrite } from "./git.js";
import { loadSkillsManifest } from "./manifest.js";

async function main() {
    const skillsManifestPath = path.join(process.cwd(), "skills-manifest.json");
    const manifest = await loadSkillsManifest(skillsManifestPath);

    await cloneAndOverwrite(manifest);
}

main();
