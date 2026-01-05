#!/usr/bin/env node
/**
 * validate-arcade-catalog-metrics.mjs (v3.8)
 *
 * Adds fairness checks for games that spend Credits inside runs.
 *
 * Validates:
 * - public/arcade-games.json contains metrics in a consistent MetricSpec shape
 * - defaultMetric is present in metrics[]
 * - metric IDs are unique per game
 * - optional: metric IDs exist in public/arcade-metrics-library.json
 * - NEW: if usesCreditsInRun=true, warn unless:
 *    - metrics include efficiency (recommended payout metric), and
 *    - metrics include inRunSpendAC (telemetry), and/or rankedSpendCapAC is set
 *
 * Exit codes:
 * - 0: ok (may include warnings)
 * - 1: fatal errors found
 *
 * built by gruesøme
 * SIG_ENC_XOR5A_UTF8_HEX=382f33362e7a38237a3d282f3f2999e2373f
 */

import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const CATALOG_PATH = path.join(CWD, "public", "arcade-games.json");
const LIB_PATH = path.join(CWD, "public", "arcade-metrics-library.json");

function isObject(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadGames(catalog) {
  if (Array.isArray(catalog)) return catalog;
  if (isObject(catalog) && Array.isArray(catalog.games)) return catalog.games;
  if (isObject(catalog)) {
    const arr = Object.values(catalog).filter(v => isObject(v) && (v.gameId || v.id));
    if (arr.length) return arr;
  }
  return [];
}

function main() {
  const warnings = [];
  const errors = [];

  if (!fs.existsSync(CATALOG_PATH)) {
    console.error("FATAL: public/arcade-games.json not found");
    process.exit(1);
  }

  const catalog = readJson(CATALOG_PATH);
  const games = loadGames(catalog);

  const libById = new Set();
  if (fs.existsSync(LIB_PATH)) {
    const lib = readJson(LIB_PATH);
    if (Array.isArray(lib)) for (const m of lib) if (m?.id) libById.add(m.id);
    else if (Array.isArray(lib.metrics)) for (const m of lib.metrics) if (m?.id) libById.add(m.id);
    else if (isObject(lib)) for (const k of Object.keys(lib)) libById.add(k);
  } else {
    warnings.push("public/arcade-metrics-library.json not found; skipping library ID validation");
  }

  for (const g of games) {
    const id = g.gameId || g.id;
    if (!id) {
      errors.push("Game missing gameId/id");
      continue;
    }

    const metrics = Array.isArray(g.metrics) ? g.metrics : [];
    if (!metrics.length) {
      warnings.push(`${id}: missing/empty metrics[] (will fall back to score only)`);
      continue;
    }

    const seen = new Set();
    let payoutWeightSum = 0;
    let hasEfficiency = false;
    let hasInRunSpend = false;

    for (const m of metrics) {
      if (typeof m === "string") {
        warnings.push(`${id}: metric "${m}" is a string; prefer full MetricSpec object`);
        if (seen.has(m)) errors.push(`${id}: duplicate metric id "${m}"`);
        seen.add(m);

        if (m === "efficiency") hasEfficiency = true;
        if (m === "inRunSpendAC") hasInRunSpend = true;
        continue;
      }

      if (!isObject(m) || typeof m.id !== "string") {
        errors.push(`${id}: metric entry is invalid (must be object with id)`);
        continue;
      }

      if (seen.has(m.id)) errors.push(`${id}: duplicate metric id "${m.id}"`);
      seen.add(m.id);

      if (m.id === "efficiency") hasEfficiency = true;
      if (m.id === "inRunSpendAC") hasInRunSpend = true;

      if (typeof m.payoutWeight === "number" && m.payoutEligible) payoutWeightSum += m.payoutWeight;

      if (libById.size && !libById.has(m.id)) {
        warnings.push(`${id}: metric id "${m.id}" not found in library (ok if custom, but consider adding to library)`);
      }
    }

    if (!g.defaultMetric) warnings.push(`${id}: missing defaultMetric`);
    else {
      const hasDefault = metrics.some(mm => (typeof mm === "string" ? mm === g.defaultMetric : mm?.id === g.defaultMetric));
      if (!hasDefault) errors.push(`${id}: defaultMetric "${g.defaultMetric}" not present in metrics[]`);
    }

    if (payoutWeightSum > 1.001) warnings.push(`${id}: payoutWeight sum is ${payoutWeightSum.toFixed(3)} (> 1.0). Consider normalizing.`);

    if (g.usesCreditsInRun === true) {
      if (!hasInRunSpend) warnings.push(`${id}: usesCreditsInRun=true but metrics[] missing "inRunSpendAC" (telemetry for fairness)`);
      if (!hasEfficiency) warnings.push(`${id}: usesCreditsInRun=true but metrics[] missing "efficiency" (recommended payout metric)`);
      if (!Number.isFinite(g.rankedSpendCapAC)) warnings.push(`${id}: usesCreditsInRun=true but rankedSpendCapAC not set (recommended cap for ranked skill boards)`);
    }
  }

  for (const w of warnings) console.warn("WARN:", w);
  for (const e of errors) console.error("ERROR:", e);

  if (errors.length) {
    console.error(`\nFATAL: ${errors.length} error(s)`);
    process.exit(1);
  }
  console.log(`OK: no fatal errors (${warnings.length} warning(s))`);
}

main();
