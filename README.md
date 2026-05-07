# skills-manifest

## Description

`skills-manifest` programtically installs selected agent skills from Git repositories using a manifest file. It sparse-clones only the configured skill directories into `./skills-manifests` and generates a typed `registry.ts` for lookup/autocomplete.

**Note:** This project is experimental.

## Installation + usage

Install:

```sh
npm install -D @niwoerner/skills-manifest
```

The unscoped `skills-manifest` npm package is a different project. Use the scoped package above.

Create `skills-manifest.json`:

```json
{
  "skills": [
    {
      "repoUrl": "https://github.com/ollygarden/opentelemetry-agent-skills.git",
      "path": "skills/go",
      "ref": "main"
    }
  ]
}
```

Wildcards are supported in `path`: `skills/*` loads valid skills directly under `skills/`, and `skills/*/**` loads valid skills recursively from `skills/` onward. Recursive wildcard skill ids preserve the path relative to the wildcard base, e.g. `skills/backend/go` becomes `.skill("backend/go")`.

Generate skills from your project root:

```sh
npx skills-manifest generate [skills-manifest.json]
```

The manifest path is optional and defaults to `./skills-manifest.json`. `npx skills-manifest` is equivalent to `generate`. It writes `skills-manifests/registry.ts` and `skills-manifests/skills-lock.json`.

For CI, validate generated skills without blocking on available updates:

```sh
npx skills-manifest validate [skills-manifest.json]
```

If remote skills changed, `validate` prints a warning and exits successfully. Run `generate` to refresh them.

Use the generated registry:

```ts
import { skills } from "./skills-manifests/registry";

const goSkill = skills
  .repo("ollygarden/opentelemetry-agent-skills")
  .skill("go");

console.log(goSkill.localPath);
```

Load generated skills into the default agent skills directory (`./.agents/skills`):

```ts
import { load, skills } from "./skills-manifests/registry";

await load(skills.repo("ollygarden/opentelemetry-agent-skills").skill("go"));
```

Or choose a custom target:

```ts
await load(goSkill, "./custom/skills/go");
```

Loading multiple skills copies them under the target by skill id, e.g. `./.agents/skills/go` and `./.agents/skills/backend/go`.

## Local development

```sh
npm install
npm run build
npm run dev
```

Run tests:

```sh
npm test
```
