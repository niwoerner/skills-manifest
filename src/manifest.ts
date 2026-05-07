import { Ajv, type JSONSchemaType } from "ajv";
import { readFile } from "node:fs/promises";

// Manifest format:
//
// {
//   "skills": [
//     {
//       "repo": "https://github.com/ollygarden/rose(.git)",
//       "ref": "main" // branch, tag, or commit hash
//     }
//   ]
// }

export interface Skill {
  repo: string;
  path: string;
  ref: string;
}

export type SkillsManifest = {
  skills: Skill[];
}

export const skillsManifestSchema: JSONSchemaType<SkillsManifest> = {
  type: "object",
  required: ["skills"],
  properties: {
    skills: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["repo", "path", "ref"],
        properties: {
          repo: { type: "string", minLength: 1 },
          path: { type: "string", minLength: 1 },
          ref: { type: "string", minLength: 1 } //ToDo: we might wanna check based on ref type
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

export async function loadSkillsManifest(path: string): Promise<SkillsManifest> {
  let parsed: SkillsManifest;
  try {
    const raw = await readFile(path, "utf8");
    parsed = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${path} is not valid JSON: ${error.message}`);
    }

    // Parse JSON
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error(`${path} not found`);
    }

    throw error;
  }

  // Validate Schema
  const ajv = new Ajv({ allErrors: true });
  const validateManifestSchema = ajv.compile(skillsManifestSchema);
  if (!validateManifestSchema(parsed)) {
    throw new Error(`Invalid ${path}:\n${ajv.errorsText(validateManifestSchema.errors, {
      separator: "\n"
    })}`);
  }

  return parsed;
}
