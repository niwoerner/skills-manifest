import path from "node:path";
import { SKILLS_MANIFESTS_DIR } from "./index.js";

/**
 * Git paths are POSIX-style; normalize user input and reject absolute/traversal
 * paths before passing them to sparse checkout or filesystem operations.
 */
export function normalizeRepoPath(repoPath: string) {
    const rawNormalized = path.posix.normalize(repoPath.replaceAll("\\", "/"));
    const normalized = rawNormalized === "/" ? rawNormalized : rawNormalized.replace(/\/+$/, "");

    if (normalized === "" || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
        throw new Error(`Invalid skill path: ${repoPath}`);
    }

    return normalized;
}

/** Returns the install folder name from a manifest path like skills/go -> go. */
export function getSkillName(skillPath: string) {
    return path.posix.basename(skillPath);
}

/** Builds the registry-relative local directory using POSIX separators. */
export function getLocalSkillDir(owner: string, repoName: string, skillName: string) {
    return path.posix.join(owner, repoName, skillName);
}

/** Builds the absolute final directory for installed skill contents. */
export function getFinalSkillDir(owner: string, repoName: string, skillName: string) {
    return path.join(process.cwd(), SKILLS_MANIFESTS_DIR, owner, repoName, skillName);
}

/** Converts a repo-relative POSIX path into a platform filesystem path. */
export function getSourceSkillDir(tempCloneDir: string, skillPath: string) {
    return path.join(tempCloneDir, ...skillPath.split("/"));
}
