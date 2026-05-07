import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { load, type SkillRegistryEntry } from "./api.js";

let tempDir: string;
let projectDir: string;
let originalCwd: string;

beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(path.join(os.tmpdir(), "skills-manifest-api-test-"));
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);
});

afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
});

describe("load", () => {
    it("loads one skill under its id when passed as an array", async () => {
        const skill = await createSkill("go", "go");

        await load([skill], "./.agents/skills");

        await expect(readProjectFile(".agents/skills/go/SKILL.md")).resolves.toContain("go");
        await expect(readProjectFile(".agents/skills/go/SKILL.manifest.md")).rejects.toThrow();
    });

    it("loads one skill directly into an explicit target path", async () => {
        const skill = await createSkill("go", "go");

        await load(skill, "./custom/go");

        await expect(readProjectFile("custom/go/SKILL.md")).resolves.toContain("go");
        await expect(readProjectFile("custom/go/SKILL.manifest.md")).rejects.toThrow();
    });

    it("loads multiple skills under their ids in an explicit target directory", async () => {
        const go = await createSkill("go", "go");
        const backendGo = await createSkill("backend/go", "backend go");

        await load([go, backendGo], "./loaded");

        await expect(readProjectFile("loaded/go/SKILL.md")).resolves.toContain("go");
        await expect(readProjectFile("loaded/backend/go/SKILL.md")).resolves.toContain("backend go");
    });

    it("removes stale target contents before copying", async () => {
        const skill = await createSkill("go", "go");
        await mkdir(path.join(projectDir, "custom/go"), { recursive: true });
        await writeFile(path.join(projectDir, "custom/go/stale.txt"), "stale", "utf8");

        await load(skill, "./custom/go");

        await expect(readProjectFile("custom/go/SKILL.md")).resolves.toContain("go");
        await expect(readProjectFile("custom/go/stale.txt")).rejects.toThrow();
    });

    it("rejects duplicate ids for multiple skills", async () => {
        const skill = await createSkill("go", "go");

        await expect(load([skill, skill], "./loaded")).rejects.toThrow("Duplicate skill id passed to load(): go");
    });

    it("rejects missing source directories", async () => {
        await expect(load({
            id: "go",
            upstreamPath: "skills/go",
            localPath: path.join(tempDir, "missing")
        }, "./loaded/go")).rejects.toThrow("Skill source does not exist or is not a directory");
    });

    it("rejects source directories missing the stored skill file", async () => {
        const sourceDir = path.join(tempDir, "sources", "missing-stored-skill-file");
        await mkdir(sourceDir, { recursive: true });

        await expect(load({
            id: "go",
            upstreamPath: "skills/go",
            localPath: sourceDir
        }, "./loaded/go")).rejects.toThrow("Skill source is missing SKILL.manifest.md");
    });

    it("rejects invalid ids when placing skills under a target directory", async () => {
        const skill = await createSkill("../bad", "bad");

        await expect(load([skill], "./.agents/skills")).rejects.toThrow("Invalid skill id: ../bad");
    });
});

async function createSkill(id: string, content: string): Promise<SkillRegistryEntry> {
    const sourceDir = path.join(tempDir, "sources", ...id.split("/"));
    await mkdir(sourceDir, { recursive: true });
    await writeFile(path.join(sourceDir, "SKILL.manifest.md"), `# ${content}\n`, "utf8");

    return {
        id,
        upstreamPath: `skills/${id}`,
        localPath: sourceDir
    };
}

function readProjectFile(relativePath: string) {
    return readFile(path.resolve(projectDir, relativePath), "utf8");
}
