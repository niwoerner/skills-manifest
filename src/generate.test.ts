import { describe, expect, it } from "vitest";
import { generateRegistry, type ClonedSkill } from "./generate.js";

const clonedSkill: ClonedSkill = {
    owner: "ollygarden",
    repoName: "opentelemetry-agent-skills",
    repoUrl: "https://github.com/ollygarden/opentelemetry-agent-skills.git",
    skillName: "go",
    registryKey: "go",
    originalPath: "skills/go",
    localDir: "ollygarden/opentelemetry-agent-skills/go"
};

describe("generateRegistry", () => {
    it("generates repoUrl data and executable localPath URLs", () => {
        const output = generateRegistry([clonedSkill]);

        expect(output).toContain("repoUrl: \"https://github.com/ollygarden/opentelemetry-agent-skills.git\"");
        expect(output).toContain("originalPath: \"skills/go\"");
        expect(output).toContain("new URL(");
        expect(output).toContain("\"./ollygarden/opentelemetry-agent-skills/go/\"");
        expect(output).toContain("export const skills = createSkillsApi(registry)");
    });

    it("uses registry keys that can preserve wildcard-relative paths", () => {
        const output = generateRegistry([
            {
                ...clonedSkill,
                skillName: "go",
                registryKey: "backend/go",
                originalPath: "skills/backend/go",
                localDir: "ollygarden/opentelemetry-agent-skills/skills/backend/go"
            }
        ]);

        expect(output).toContain("\"backend/go\": {");
        expect(output).toContain("originalPath: \"skills/backend/go\"");
    });

    it("rejects duplicate skill destinations", () => {
        expect(() => generateRegistry([clonedSkill, clonedSkill])).toThrow(
            "Duplicate skill destination in registry: ollygarden/opentelemetry-agent-skills/go"
        );
    });
});
