import { describe, expect, it } from "vitest";
import {
    getLocalSkillDir,
    getSkillName,
    getWildcardRegistryKey,
    normalizeRepoPath,
    parseSkillPathSelector
} from "./paths.js";

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

    it("derives skill names, registry keys, and local dirs", () => {
        expect(getSkillName("skills/general/declarative-config")).toBe("declarative-config");
        expect(getWildcardRegistryKey("skills", "skills/backend/go")).toBe("backend/go");
        expect(getLocalSkillDir("owner", "repo", "skills/backend/go")).toBe("owner/repo/skills/backend/go");
    });

    it("parses exact paths", () => {
        expect(parseSkillPathSelector("skills/go")).toEqual({
            kind: "exact",
            path: "skills/go"
        });
    });

    it("parses direct wildcard paths", () => {
        expect(parseSkillPathSelector("*")).toEqual({
            kind: "wildcard",
            basePath: "",
            recursive: false
        });
        expect(parseSkillPathSelector("skills/*")).toEqual({
            kind: "wildcard",
            basePath: "skills",
            recursive: false
        });
    });

    it("parses recursive wildcard paths from the defined base onward", () => {
        expect(parseSkillPathSelector("*/**")).toEqual({
            kind: "wildcard",
            basePath: "",
            recursive: true
        });
        expect(parseSkillPathSelector("skills/*/**")).toEqual({
            kind: "wildcard",
            basePath: "skills",
            recursive: true
        });
        expect(parseSkillPathSelector("foo/bar/*/**")).toEqual({
            kind: "wildcard",
            basePath: "foo/bar",
            recursive: true
        });
    });

    it("rejects unsupported wildcard patterns", () => {
        expect(() => parseSkillPathSelector("foo/*/bar")).toThrow("Unsupported skill path wildcard pattern");
        expect(() => parseSkillPathSelector("foo/*/bar/*")).toThrow("Unsupported skill path wildcard pattern");
        expect(() => parseSkillPathSelector("skills/**")).toThrow("Unsupported skill path wildcard pattern");
    });
});
