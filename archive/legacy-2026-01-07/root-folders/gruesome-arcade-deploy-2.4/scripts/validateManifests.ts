// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import type { ErrorObject, ValidateFunction } from "ajv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const Ajv2020: new (opts?: unknown) => { compile: (schema: unknown) => ValidateFunction } = require("ajv/dist/2020");

type ValidationIssue = {
  file: string;
  errors: Array<{ instancePath?: string; schemaPath?: string; message?: string }>;
};

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listDeploymentJsonFiles(deploymentsDir: string): string[] {
  const entries = fs.readdirSync(deploymentsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => n.endsWith(".json"))
    .filter((n) => n !== "manifest.schema.json")
    .map((n) => path.join(deploymentsDir, n));
}

function isManifestLike(filePath: string, value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;

  // Only validate files that look like the standardized manifest.
  // This avoids rejecting ui-config exports or any future helper JSON.
  return (
    filePath.includes(`${path.sep}deployments${path.sep}arcade.`) ||
    path.basename(filePath) === "latest.json"
  ) &&
    typeof obj.kitVersion === "string" &&
    typeof obj.manifestVersion === "number" &&
    typeof obj.network === "object" &&
    typeof obj.contracts === "object";
}

function formatIssue(issue: ValidationIssue): string {
  const relFile = path.relative(process.cwd(), issue.file);
  const lines = issue.errors.map((e) => {
    const where = e.instancePath ? `at ${e.instancePath}` : "";
    const msg = e.message ?? "schema validation error";
    return `  - ${msg} ${where}`.trimEnd();
  });

  return [`[manifest:invalid] ${relFile}`, ...lines].join("\n");
}

function main() {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const schemaPath = path.join(deploymentsDir, "manifest.schema.json");

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Missing schema at ${schemaPath}`);
  }

  const schema = readJsonFile(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  let validate: ValidateFunction;
  try {
    validate = ajv.compile(schema);
  } catch (err) {
    console.error("[manifest] schema compile failed");
    console.error(err);
    process.exitCode = 1;
    return;
  }

  const files = listDeploymentJsonFiles(deploymentsDir);
  const issues: ValidationIssue[] = [];
  let validatedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const json = readJsonFile(file);

    if (!isManifestLike(file, json)) {
      skippedCount++;
      continue;
    }

    validatedCount++;
    const ok = validate(json);
    if (!ok) {
      issues.push({
        file,
        errors: (validate.errors ?? []).map((e: ErrorObject) => ({
          instancePath: e.instancePath,
          schemaPath: e.schemaPath,
          message: e.message
        }))
      });
    }
  }

  if (issues.length) {
    for (const issue of issues) console.error(formatIssue(issue));
    console.error(
      `[manifest] failed: ${issues.length} invalid file(s). Validated=${validatedCount} Skipped=${skippedCount}`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`[manifest] ok. Validated=${validatedCount} Skipped=${skippedCount}`);
}

main();
