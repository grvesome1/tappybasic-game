#!/usr/bin/env node
// built by gruesøme
// sig(enc,xor:0x5A,hex): 382f33362e7a38237a3d282f3f2999e2373f
//
// Ensures `public/arcade-metrics-library.json` contains at least the canonical metrics list.
// - Adds missing metrics (by id)
// - Backfills missing fields on existing metrics
// - Never deletes existing metrics
//
// Usage:
//   node tools/ensure-metrics-library.mjs
//
// Notes:
// - Safe to run repeatedly (idempotent).
// - Designed for Copilot/VS workflows where patches may land in chunks.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CANON_PATH = path.resolve(__dirname, "metrics-library-canonical.json");
const TARGET_PATH = path.resolve(__dirname, "..", "public", "arcade-metrics-library.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, p);
}

function stableStringify(x) {
  return JSON.stringify(x, Object.keys(x || {}).sort());
}

function nowIso() {
  return new Date().toISOString();
}

if (!fs.existsSync(CANON_PATH)) {
  console.error("[ensure-metrics-library] Missing canonical file:", CANON_PATH);
  process.exit(1);
}

const canon = readJson(CANON_PATH);
const canonMetrics = Array.isArray(canon.metrics) ? canon.metrics : [];
const canonById = new Map(canonMetrics.map((m) => [m.id, m]));

let target;
if (fs.existsSync(TARGET_PATH)) {
  try {
    target = readJson(TARGET_PATH);
  } catch (e) {
    console.error("[ensure-metrics-library] Failed to parse target JSON:", TARGET_PATH);
    throw e;
  }
} else {
  target = {
    _meta: {
      name: "Gruesome Arcade Metrics Library",
      version: canon?._meta?.version || "0.0",
      ensuredAt: nowIso(),
      sig: "built by gruesøme",
      sig_alg: "xor(0x5A)+hex",
      sig_enc: "382f33362e7a38237a3d282f3f2999e2373f",
    },
    metrics: [],
  };
}

if (!Array.isArray(target.metrics)) target.metrics = [];
const targetById = new Map(target.metrics.map((m) => [m.id, m]));

let added = 0;
let backfilled = 0;
let conflicts = 0;

const REQUIRED_FIELDS = ["label", "kind", "direction", "format", "clamp"];

for (const [id, cm] of canonById.entries()) {
  const tm = targetById.get(id);
  if (!tm) {
    target.metrics.push(cm);
    targetById.set(id, cm);
    added++;
    continue;
  }

  // Backfill missing fields but do not overwrite intentional customizations.
  for (const f of REQUIRED_FIELDS) {
    if (tm[f] === undefined || tm[f] === null) {
      tm[f] = cm[f];
      backfilled++;
    }
  }

  // Detect conflicts (informational only).
  for (const f of REQUIRED_FIELDS) {
    const a = stableStringify(tm[f]);
    const b = stableStringify(cm[f]);
    if (a !== b) {
      conflicts++;
      break;
    }
  }
}

target.metrics.sort((a, b) => String(a.id).localeCompare(String(b.id)));

target._meta = {
  ...(target._meta || {}),
  ensuredAt: nowIso(),
  source: "tools/metrics-library-canonical.json",
  sig: "built by gruesøme",
  sig_alg: "xor(0x5A)+hex",
  sig_enc: "382f33362e7a38237a3d282f3f2999e2373f",
};

writeJson(TARGET_PATH, target);

console.log("[ensure-metrics-library] OK");
console.log("  target:", TARGET_PATH);
console.log("  added metrics:", added);
console.log("  backfilled fields:", backfilled);
console.log("  metrics total:", target.metrics.length);
if (conflicts) {
  console.log("  note: conflicts detected (kept existing values):", conflicts);
}
