// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import fs from "fs";
import path from "path";

type Options = {
  target: string;
  subdir: string;
  dryRun: boolean;
  overwrite: boolean;
};

type CopyItem = {
  srcAbs: string;
  dstAbs: string;
  kind: "file" | "dir";
};

function usage(): string {
  return (
    "Usage:\n" +
    "  npm run migrate:vendor -- --target <path> [--subdir arcade-integration-kit] [--dry-run] [--overwrite]\n\n" +
    "Notes:\n" +
    "  - Copies this repo's integration kit assets into <target>/<subdir>.\n" +
    "  - Safe by default: --dry-run is on unless you pass --no-dry-run.\n" +
    "  - Never deletes anything; --overwrite only allows replacing existing files.\n"
  );
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    target: "",
    subdir: "arcade-integration-kit",
    dryRun: true,
    overwrite: false
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (a === "--help" || a === "-h") {
      console.log(usage());
      process.exit(0);
    }

    if (a === "--target") {
      opts.target = String(argv[++i] || "").trim();
      continue;
    }

    if (a === "--subdir") {
      opts.subdir = String(argv[++i] || "").trim() || opts.subdir;
      continue;
    }

    if (a === "--dry-run") {
      opts.dryRun = true;
      continue;
    }

    if (a === "--no-dry-run") {
      opts.dryRun = false;
      continue;
    }

    if (a === "--overwrite") {
      opts.overwrite = true;
      continue;
    }

    throw new Error(`Unknown arg: ${a}\n\n${usage()}`);
  }

  if (!opts.target) throw new Error(`Missing --target\n\n${usage()}`);

  return opts;
}

function normalizeAbs(p: string): string {
  return path.resolve(p);
}

function shouldSkipRel(relPosix: string): boolean {
  // Never copy build outputs / deps
  if (relPosix === "node_modules" || relPosix.startsWith("node_modules/")) return true;
  if (relPosix === "dist" || relPosix.startsWith("dist/")) return true;
  if (relPosix === "artifacts" || relPosix.startsWith("artifacts/")) return true;
  if (relPosix === "cache" || relPosix.startsWith("cache/")) return true;
  if (relPosix === ".git" || relPosix.startsWith(".git/")) return true;

  // These are only meaningful in the source repo root
  if (relPosix === ".github" || relPosix.startsWith(".github/")) return true;

  // Avoid copying workspace/editor noise
  if (relPosix === ".vscode" || relPosix.startsWith(".vscode/")) return true;

  // Avoid nested package build outputs
  if (relPosix.includes("/node_modules/")) return true;
  if (relPosix.includes("/dist/")) return true;
  if (relPosix.includes("/artifacts/")) return true;

  return false;
}

function collectCopyPlan(srcRootAbs: string, dstRootAbs: string): CopyItem[] {
  const items: CopyItem[] = [];

  function walk(curAbs: string) {
    const rel = path.relative(srcRootAbs, curAbs);
    const relPosix = rel.replace(/\\/g, "/");

    if (relPosix && shouldSkipRel(relPosix)) return;

    const st = fs.statSync(curAbs);
    if (st.isDirectory()) {
      const dstDirAbs = path.join(dstRootAbs, rel);
      items.push({ srcAbs: curAbs, dstAbs: dstDirAbs, kind: "dir" });

      for (const ent of fs.readdirSync(curAbs, { withFileTypes: true })) {
        walk(path.join(curAbs, ent.name));
      }
      return;
    }

    if (st.isFile()) {
      const dstFileAbs = path.join(dstRootAbs, rel);
      items.push({ srcAbs: curAbs, dstAbs: dstFileAbs, kind: "file" });
      return;
    }
  }

  walk(srcRootAbs);
  return items;
}

function ensureDirSync(dirAbs: string) {
  fs.mkdirSync(dirAbs, { recursive: true });
}

function writeTextFileSync(fileAbs: string, contents: string, overwrite: boolean) {
  if (fs.existsSync(fileAbs) && !overwrite) {
    throw new Error(`Refusing to overwrite existing file: ${fileAbs}`);
  }
  ensureDirSync(path.dirname(fileAbs));
  fs.writeFileSync(fileAbs, contents, "utf8");
}

function copyFileSync(srcAbs: string, dstAbs: string, overwrite: boolean) {
  if (fs.existsSync(dstAbs) && !overwrite) {
    throw new Error(`Refusing to overwrite existing file: ${dstAbs}`);
  }
  ensureDirSync(path.dirname(dstAbs));
  fs.copyFileSync(srcAbs, dstAbs);
}

function formatRel(pAbs: string, rootAbs: string): string {
  return path.relative(rootAbs, pAbs).replace(/\\/g, "/");
}

function makeReportText(opts: Options, srcRootAbs: string, dstRootAbs: string, fileCount: number): string {
  const now = new Date().toISOString();
  return (
    "<!-- built by gruesøme -->\n" +
    "<!-- sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f -->\n\n" +
    `# Arcade Integration Kit Vendoring Report\n\n` +
    `Generated: ${now}\n\n` +
    `Source: ${srcRootAbs}\n` +
    `Target: ${dstRootAbs}\n\n` +
    `Mode: ${opts.dryRun ? "DRY RUN" : "WRITE"}${opts.overwrite ? " (overwrite enabled)" : ""}\n\n` +
    `Planned files: ${fileCount}\n\n` +
    "## Next steps inside the Arcade repo\n\n" +
    "- Decide whether to add this folder to the monorepo workspaces (recommended if you want to build the SDK/backend-kit in CI).\n" +
    "- If you want the CI gates and scheduled epoch workflows, copy/merge the workflows from this kit's .github/workflows into the Arcade repo root .github/workflows manually (this script intentionally does not copy workflows).\n" +
    "- Run the kit gates from the Arcade repo root, pointing into this folder, or by adding workspace entries.\n"
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const srcRootAbs = normalizeAbs(process.cwd());
  const dstRootAbs = normalizeAbs(path.join(opts.target, opts.subdir));

  if (!fs.existsSync(opts.target) || !fs.statSync(opts.target).isDirectory()) {
    throw new Error(`Target does not exist or is not a directory: ${opts.target}`);
  }

  const plan = collectCopyPlan(srcRootAbs, dstRootAbs);

  // De-dupe dir entries (walk adds dirs multiple times)
  const dirSet = new Set<string>();
  const fileItems: CopyItem[] = [];

  for (const it of plan) {
    if (it.kind === "dir") dirSet.add(it.dstAbs);
    else fileItems.push(it);
  }

  const dirs = Array.from(dirSet).sort((a, b) => a.localeCompare(b));
  const files = fileItems.sort((a, b) => a.dstAbs.localeCompare(b.dstAbs));

  console.log(`[migrate] source: ${srcRootAbs}`);
  console.log(`[migrate] target: ${dstRootAbs}`);
  console.log(`[migrate] mode: ${opts.dryRun ? "dry-run" : "write"}${opts.overwrite ? ", overwrite" : ""}`);
  console.log(`[migrate] dirs: ${dirs.length} | files: ${files.length}`);

  if (opts.dryRun) {
    console.log("[migrate] dry-run summary (first 30 files):");
    for (const f of files.slice(0, 30)) {
      console.log(`  - ${formatRel(f.srcAbs, srcRootAbs)} -> ${formatRel(f.dstAbs, dstRootAbs)}`);
    }
    if (files.length > 30) console.log(`  ... and ${files.length - 30} more`);
    console.log("[migrate] pass --no-dry-run to actually write files");
    return;
  }

  for (const d of dirs) ensureDirSync(d);

  for (const f of files) {
    copyFileSync(f.srcAbs, f.dstAbs, opts.overwrite);
  }

  const reportAbs = path.join(dstRootAbs, "MIGRATION_REPORT.md");
  const report = makeReportText(opts, srcRootAbs, dstRootAbs, files.length);
  writeTextFileSync(reportAbs, report, opts.overwrite);

  console.log(`[migrate] wrote ${files.length} file(s)`);
  console.log(`[migrate] report: ${reportAbs}`);
}

main().catch((err) => {
  console.error(String(err?.stack || err?.message || err));
  process.exitCode = 1;
});
