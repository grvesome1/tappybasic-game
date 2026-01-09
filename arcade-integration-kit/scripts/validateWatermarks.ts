// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import fs from "fs";
import path from "path";

const REQUIRED_TEXT = "built by gruesøme";

function decodeXor5a(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid sig hex length");

  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2), 16));
  }

  const decoded = bytes.map((b) => String.fromCharCode(b ^ 0x5a)).join("");
  return decoded;
}

function readFirstLines(filePath: string, maxLines: number): string[] {
  const text = fs.readFileSync(filePath, "utf8");
  return text.split(/\r?\n/).slice(0, maxLines);
}

function hasRequiredHeader(lines: string[]): { ok: boolean; sigHex?: string } {
  const joined = lines.join("\n");
  const hasBuiltBy = joined.toLowerCase().includes(REQUIRED_TEXT);
  const sigMatch = joined.match(/sig \(xor5a\):\s*(0x[0-9a-fA-F]+)/);
  if (!hasBuiltBy || !sigMatch) return { ok: false };

  return { ok: true, sigHex: sigMatch[1] };
}

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "artifacts") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
}

function main() {
  const root = process.cwd();
  const targets: string[] = [];

  const includeRoots = [
    path.join(root, "scripts"),
    path.join(root, "packages"),
    path.join(root, ".github", "workflows")
  ];

  for (const r of includeRoots) {
    if (!fs.existsSync(r)) continue;
    walk(r, targets);
  }

  const shouldCheck = (filePath: string) => {
    const rel = path.relative(root, filePath).replace(/\\/g, "/");

    if (rel.startsWith("packages/") && rel.includes("/dist/")) return false;
    if (rel.startsWith("packages/") && !rel.includes("/src/")) return false;

    if (rel.startsWith("scripts/") && rel.endsWith(".ts")) return true;
    if (rel.startsWith("packages/") && rel.endsWith(".ts")) return true;
    if (rel.startsWith(".github/workflows/") && (rel.endsWith(".yml") || rel.endsWith(".yaml"))) return true;

    return false;
  };

  const files = targets.filter(shouldCheck);
  const failures: string[] = [];

  for (const f of files) {
    const lines = readFirstLines(f, 8);
    const { ok, sigHex } = hasRequiredHeader(lines);

    if (!ok || !sigHex) {
      failures.push(`[watermark] missing header: ${path.relative(root, f)}`);
      continue;
    }

    let decoded = "";
    try {
      decoded = decodeXor5a(sigHex);
    } catch {
      failures.push(`[watermark] invalid sig hex: ${path.relative(root, f)} (${sigHex})`);
      continue;
    }

    if (decoded !== REQUIRED_TEXT) {
      failures.push(`[watermark] sig mismatch: ${path.relative(root, f)} decoded='${decoded}'`);
      continue;
    }
  }

  if (failures.length) {
    for (const s of failures) console.error(s);
    console.error(`[watermark] failed: ${failures.length} file(s)`);
    process.exitCode = 1;
    return;
  }

  console.log(`[watermark] ok (${files.length} file(s) checked)`);
}

main();
