# skills-manifest

## Description

`skills-manifest` installs selected agent skills from Git repositories using a manifest file. It sparse-clones only the configured skill directories into `./skills-manifests` and generates a typed `registry.ts` for lookup/autocomplete.

## Installation + usage

Install:

```sh
npm install skills-manifest
```

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

Run from your project root:

```sh
npx skills-manifest
```

Use the generated registry:

```ts
import { skills } from "./skills-manifests/registry";

const goSkill = skills
  .repo("ollygarden/opentelemetry-agent-skills")
  .skill("go");

console.log(goSkill.localPath);
```

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
