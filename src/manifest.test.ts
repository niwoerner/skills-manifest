import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSkillsManifest } from "./manifest.js";

let tempDir: string | undefined;

async function writeManifest(value: unknown) {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "skills-manifest-test-"));
    const filePath = path.join(tempDir, "skills-manifest.json");
    await writeFile(filePath, JSON.stringify(value), "utf8");
    return filePath;
}

afterEach(async () => {
    if (tempDir) {
        await rm(tempDir, { recursive: true, force: true });
        tempDir = undefined;
    }
});

describe("loadSkillsManifest", () => {
    it("loads manifests with repoUrl", async () => {
        const filePath = await writeManifest({
            skills: [
                {
                    repoUrl: "https://github.com/owner/repo.git",
                    path: "skills/go",
                    ref: "main"
                }
            ]
        });

        await expect(loadSkillsManifest(filePath)).resolves.toEqual({
            skills: [
                {
                    repoUrl: "https://github.com/owner/repo.git",
                    path: "skills/go",
                    ref: "main"
                }
            ]
        });
    });

    it("rejects old repo field without backwards compatibility", async () => {
        const filePath = await writeManifest({
            skills: [
                {
                    repo: "https://github.com/owner/repo.git",
                    path: "skills/go",
                    ref: "main"
                }
            ]
        });

        await expect(loadSkillsManifest(filePath)).rejects.toThrow("repoUrl");
    });
});
