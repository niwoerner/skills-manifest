import path from "node:path";
import { SKILLS_MANIFESTS_DIR } from "./index.js";

export type SkillPathSelector =
    | { kind: "exact"; path: string }
    | { kind: "wildcard"; basePath: string; recursive: boolean };

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

export function parseSkillPathSelector(repoPath: string): SkillPathSelector {
    const normalized = normalizeSelectorPath(repoPath);

    if (!normalized.includes("*")) {
        return { kind: "exact", path: normalizeRepoPath(repoPath) };
    }

    if (normalized === "*") {
        return { kind: "wildcard", basePath: "", recursive: false };
    }

    if (normalized === "*/**") {
        return { kind: "wildcard", basePath: "", recursive: true };
    }

    if (normalized.endsWith("/*/**")) {
        const basePath = normalized.slice(0, -"/*/**".length);
        return { kind: "wildcard", basePath: normalizeWildcardBasePath(basePath, repoPath), recursive: true };
    }

    if (normalized.endsWith("/*")) {
        const basePath = normalized.slice(0, -"/*".length);
        return { kind: "wildcard", basePath: normalizeWildcardBasePath(basePath, repoPath), recursive: false };
    }

    throw new Error(`Unsupported skill path wildcard pattern: ${repoPath}`);
}

function normalizeWildcardBasePath(basePath: string, rawPath: string) {
    if (basePath.includes("*")) {
        throw new Error(`Unsupported skill path wildcard pattern: ${rawPath}`);
    }

    return normalizeRepoPath(basePath);
}

function normalizeSelectorPath(repoPath: string) {
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

/** Builds the registry key for a discovered wildcard skill relative to the wildcard base. */
export function getWildcardSkillId(basePath: string, skillPath: string) {
    const id = basePath === "" ? skillPath : path.posix.relative(basePath, skillPath);

    if (id === "" || id === "." || id.startsWith("../")) {
        throw new Error(`Discovered skill path is not under wildcard base: ${skillPath}`);
    }

    return id;
}

/** Builds the registry-relative local directory using POSIX separators. */
export function getLocalSkillDir(owner: string, repoName: string, installPath: string) {
    return path.posix.join(owner, repoName, installPath);
}

/** Builds the absolute final directory for installed skill contents. */
export function getFinalSkillDir(owner: string, repoName: string, installPath: string) {
    return path.join(process.cwd(), SKILLS_MANIFESTS_DIR, owner, repoName, ...installPath.split("/"));
}

/** Converts a repo-relative POSIX path into a platform filesystem path. */
export function getSourceSkillDir(tempCloneDir: string, skillPath: string) {
    return path.join(tempCloneDir, ...skillPath.split("/"));
}
