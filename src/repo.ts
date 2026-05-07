export type ParsedGitRepo = {
    owner: string;
    repoName: string;
};

/**
 * Extracts owner/repo from HTTPS and SSH Git URLs so installs have a stable,
 * predictable destination path independent of URL style.
 */
export function parseGitRepo(repoUrl: string): ParsedGitRepo {
    const withoutTrailingSlash = repoUrl.replace(/\/+$/, "");
    const withoutGitSuffix = withoutTrailingSlash.replace(/\.git$/, "");

    let repoPath: string;

    const scpLikeMatch = withoutGitSuffix.match(/^[^@/:]+@[^:]+:(.+)$/);
    if (scpLikeMatch) {
        repoPath = scpLikeMatch[1];
    } else {
        try {
            const url = new URL(withoutGitSuffix);
            repoPath = url.pathname.replace(/^\/+/, "");
        } catch {
            repoPath = withoutGitSuffix;
        }
    }

    const parts = repoPath.split("/").filter(Boolean);
    if (parts.length < 2) {
        throw new Error(`Could not parse owner/repo from repo URL: ${repoUrl}`);
    }

    return {
        owner: parts[parts.length - 2],
        repoName: parts[parts.length - 1]
    };
}
