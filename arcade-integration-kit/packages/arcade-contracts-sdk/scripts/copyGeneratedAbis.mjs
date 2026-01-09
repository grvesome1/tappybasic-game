// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function copyDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(src, dst);
      continue;
    }

    fs.copyFileSync(src, dst);
  }
}

const pkgRoot = path.join(__dirname, "..");
const src = path.join(pkgRoot, "src", "generated", "abi");
const dst = path.join(pkgRoot, "dist", "generated", "abi");

if (!fs.existsSync(src)) {
  console.error(`[copy-abis] missing: ${src}`);
  process.exitCode = 1;
} else {
  copyDir(src, dst);
  console.log(`[copy-abis] copied -> ${dst}`);
}
