import { describe, expect, it } from "vitest";
import { getLocalSkillDir, getSkillName, normalizeRepoPath } from "./paths.js";

describe("paths", () => {
    it("normalizes repo paths to Git POSIX paths", () => {
        expect(normalizeRepoPath("skills//go/")).toBe("skills/go");
        expect(normalizeRepoPath("skills\\go")).toBe("skills/go");
    });

    it("rejects unsafe repo paths", () => {
        expect(() => normalizeRepoPath("../go")).toThrow("Invalid skill path");
        expect(() => normalizeRepoPath("/skills/go")).toThrow("Invalid skill path");
        expect(() => normalizeRepoPath(".")).toThrow("Invalid skill path");
    });

    it("derives skill names and local dirs", () => {
        expect(getSkillName("skills/general/declarative-config")).toBe("declarative-config");
        expect(getLocalSkillDir("owner", "repo", "go")).toBe("owner/repo/go");
    });
});
