import { describe, expect, it } from "vitest";
import { generateRegistry, type ClonedSkill } from "./generate.js";

const clonedSkill: ClonedSkill = {
    id: "go",
    owner: "ollygarden",
    repoName: "opentelemetry-agent-skills",
    repoUrl: "https://github.com/ollygarden/opentelemetry-agent-skills.git",
    ref: "main",
    resolvedCommit: "abc123",
    manifestPath: "skills/go",
    skillName: "go",
    upstreamPath: "skills/go",
    localDir: "ollygarden/opentelemetry-agent-skills/go"
};

describe("generateRegistry", () => {
    it("generates repoUrl data and executable localPath URLs", () => {
        const output = generateRegistry([clonedSkill]);

        expect(output).toContain("import { createSkillsRegistry, load as loadSkills } from \"@niwoerner/skills-manifest/api\"");
        expect(output).toContain("export const AGENT_SKILLS_DIR = \"./.agents/skills\"");
        expect(output).toContain("repoUrl: \"https://github.com/ollygarden/opentelemetry-agent-skills.git\"");
        expect(output).toContain("id: \"go\"");
        expect(output).toContain("upstreamPath: \"skills/go\"");
        expect(output).toContain("new URL(");
        expect(output).toContain("\"./ollygarden/opentelemetry-agent-skills/go/\"");
        expect(output).toContain("export const skills = createSkillsRegistry(registry)");
        expect(output).toContain("export function load(");
    });

    it("uses skill ids that can preserve wildcard-relative paths", () => {
        const output = generateRegistry([
            {
                ...clonedSkill,
                skillName: "go",
                id: "backend/go",
                upstreamPath: "skills/backend/go",
                localDir: "ollygarden/opentelemetry-agent-skills/skills/backend/go"
            }
        ]);

        expect(output).toContain("\"backend/go\": {");
        expect(output).toContain("id: \"backend/go\"");
        expect(output).toContain("upstreamPath: \"skills/backend/go\"");
    });

    it("rejects duplicate skill destinations", () => {
        expect(() => generateRegistry([clonedSkill, clonedSkill])).toThrow(
            "Duplicate skill destination in registry: ollygarden/opentelemetry-agent-skills/go"
        );
    });
});
