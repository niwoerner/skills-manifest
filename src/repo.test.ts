import { describe, expect, it } from "vitest";
import { parseGitRepo } from "./repo.js";

describe("parseGitRepo", () => {
    it("parses HTTPS GitHub URLs", () => {
        expect(parseGitRepo("https://github.com/owner/repo.git")).toEqual({
            owner: "owner",
            repoName: "repo"
        });
    });

    it("parses SSH scp-like URLs", () => {
        expect(parseGitRepo("git@github.com:owner/repo.git")).toEqual({
            owner: "owner",
            repoName: "repo"
        });
    });

    it("throws when owner/repo cannot be found", () => {
        expect(() => parseGitRepo("repo-only")).toThrow("Could not parse owner/repo");
    });
});
