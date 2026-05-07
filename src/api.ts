export type SkillRegistryEntry = {
    originalPath: string;
    localPath: string;
};

export type RepoRegistryEntry = {
    repoUrl: string;
    skills: Record<string, SkillRegistryEntry>;
};

export type SkillsRegistry = Record<string, RepoRegistryEntry>;

/**
 * Keeps the generated registry as plain data while providing a tiny typed lookup
 * API for repo(...).skill(...) autocomplete.
 */
export function createSkillsApi<const Registry extends SkillsRegistry>(registry: Registry) {
    return {
        registry,

        repo<RepoName extends keyof Registry & string>(repoName: RepoName) {
            const repo = registry[repoName];

            return {
                ...repo,

                skill<SkillName extends keyof Registry[RepoName]["skills"] & string>(skillName: SkillName) {
                    return repo.skills[skillName] as Registry[RepoName]["skills"][SkillName];
                }
            };
        }
    };
}
