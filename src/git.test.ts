import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateGeneratedSkills } from "./check.js";
import { cloneAndOverwrite } from "./git.js";
import { writeSkillsLock } from "./lock.js";
import type { Skill } from "./manifest.js";

const execFileAsync = promisify(execFile);

let tempDir: string;
let projectDir: string;
let sourceRepo: string;
let originalCwd: string;

beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(path.join(os.tmpdir(), "skills-manifest-git-test-"));
    projectDir = path.join(tempDir, "project");
    sourceRepo = path.join(tempDir, "owner", "repo");

    await mkdir(projectDir, { recursive: true });
    await createSourceRepo(sourceRepo);
    process.chdir(projectDir);
});

afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
});

describe("cloneAndOverwrite", () => {
    it("keeps exact path behavior and registry keys", async () => {
        const [clonedSkill] = await cloneAndOverwrite({
            skills: [skill("skills/go")]
        });

        expect(clonedSkill).toMatchObject({
            owner: "owner",
            repoName: "repo",
            skillName: "go",
            id: "go",
            upstreamPath: "skills/go",
            localDir: "owner/repo/go"
        });
        await expect(readInstalledSkill("owner/repo/go/SKILL.manifest.md")).resolves.toContain("go");
        await expect(readInstalledSkill("owner/repo/go/SKILL.md")).rejects.toThrow();
    });

    it("loads valid skills directly under the defined wildcard path", async () => {
        const clonedSkills = await cloneAndOverwrite({
            skills: [skill("skills/*")]
        });

        expect(clonedSkills.map((clonedSkill) => clonedSkill.id)).toEqual(["go"]);
        expect(clonedSkills[0].localDir).toBe("owner/repo/skills/go");
        await expect(readInstalledSkill("owner/repo/skills/go/SKILL.manifest.md")).resolves.toContain("go");
        await expect(readInstalledSkill("owner/repo/skills/go/SKILL.md")).rejects.toThrow();
    });

    it("loads valid skills recursively from the defined wildcard path onward", async () => {
        const clonedSkills = await cloneAndOverwrite({
            skills: [skill("skills/*/**")]
        });

        expect(clonedSkills.map((clonedSkill) => [clonedSkill.id, clonedSkill.upstreamPath])).toEqual([
            ["backend/go", "skills/backend/go"],
            ["frontend/js", "skills/frontend/js"],
            ["go", "skills/go"]
        ]);
        await expect(readInstalledSkill("owner/repo/skills/backend/go/SKILL.manifest.md")).resolves.toContain("backend go");
        await expect(readInstalledSkill("owner/repo/skills/frontend/js/SKILL.manifest.md")).resolves.toContain("frontend js");
        await expect(readInstalledSkill("owner/repo/skills/backend/go/SKILL.md")).rejects.toThrow();
    });

    it("loads valid skills recursively from repo root with */**", async () => {
        const clonedSkills = await cloneAndOverwrite({
            skills: [skill("*/**")]
        });

        expect(clonedSkills.map((clonedSkill) => clonedSkill.id)).toEqual([
            "other/go",
            "skills/backend/go",
            "skills/frontend/js",
            "skills/go"
        ]);
    });

    it("validates generated skills as up to date", async () => {
        const manifest = { skills: [skill("skills/*/**")] };
        const clonedSkills = await cloneAndOverwrite(manifest);
        await writeSkillsLock(clonedSkills);

        const lock = JSON.parse(await readFile(path.join(projectDir, "skills-manifests", "skills-lock.json"), "utf8"));
        expect(Object.keys(lock.skills[0]).slice(0, 3)).toEqual(["id", "owner", "repoName"]);
        await expect(validateGeneratedSkills(manifest)).resolves.toEqual([]);
    });

    it("warns when generated skills are out of date without failing validation", async () => {
        const manifest = { skills: [skill("skills/*/**")] };
        const clonedSkills = await cloneAndOverwrite(manifest);
        await writeSkillsLock(clonedSkills);

        await writeSkill(sourceRepo, "skills/rust", "rust");
        await git(["add", "."], sourceRepo);
        await git(["commit", "-m", "add rust skill"], sourceRepo);

        const warnings = await validateGeneratedSkills(manifest);

        expect(warnings.some((warning) => warning.includes("Added skill"))).toBe(true);
    });

    it("rejects duplicate registry keys across wildcard bases", async () => {
        await expect(cloneAndOverwrite({
            skills: [skill("skills/*/**"), skill("other/*/**")]
        })).rejects.toThrow("Duplicate skill destination in registry: owner/repo/go");
    });
});

function skill(pathValue: string): Skill {
    return {
        repoUrl: sourceRepo,
        path: pathValue,
        ref: "main"
    };
}

async function readInstalledSkill(relativePath: string) {
    return readFile(path.join(projectDir, "skills-manifests", ...relativePath.split("/")), "utf8");
}

async function createSourceRepo(repoPath: string) {
    await mkdir(repoPath, { recursive: true });
    await git(["init", "--initial-branch=main"], repoPath);
    await git(["config", "user.email", "test@example.com"], repoPath);
    await git(["config", "user.name", "Test User"], repoPath);

    await writeSkill(repoPath, "skills/go", "go");
    await writeSkill(repoPath, "skills/backend/go", "backend go");
    await writeSkill(repoPath, "skills/frontend/js", "frontend js");
    await writeSkill(repoPath, "other/go", "other go");
    await mkdir(path.join(repoPath, "skills", "not-a-skill"), { recursive: true });
    await writeFile(path.join(repoPath, "skills", "not-a-skill", "README.md"), "not a skill", "utf8");

    await git(["add", "."], repoPath);
    await git(["commit", "-m", "add skills"], repoPath);
}

async function writeSkill(repoPath: string, skillPath: string, name: string) {
    const skillDir = path.join(repoPath, ...skillPath.split("/"));
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), `# ${name}\n`, "utf8");
}

async function git(args: string[], cwd: string) {
    await execFileAsync("git", args, { cwd });
}
