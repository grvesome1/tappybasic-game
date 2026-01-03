#!/usr/bin/env node
/**
 * validate-arcade-catalog-metrics.mjs
 *
 * Quick sanity checker for `public/arcade-games.json` metric declarations.
 *
 * - No dependencies (Node built-ins only)
 * - Safe: never writes files
 *
 * built by gruesøme
 * sig_enc (xor+b64): OC8zNi56OCN6PSgvPymZ4jc/
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, "public", "arcade-games.json");

const EPS = 1e-6;

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function normalizeGames(catalog) {
  if (Array.isArray(catalog)) return catalog;
  if (isObject(catalog) && Array.isArray(catalog.games)) return catalog.games;
  if (isObject(catalog)) {
    // Support `{ "<id>": {...game...}, ... }`
    const vals = Object.values(catalog);
    if (vals.every((v) => isObject(v) && ("id" in v || "title" in v))) return vals;
  }
  return [];
}

function sumWeights(payoutMetrics) {
  return payoutMetrics.reduce((acc, m) => acc + (Number(m.weight) || 0), 0);
}

function fmtGame(g, idx) {
  const id = (g && g.id) ? String(g.id) : `#${idx + 1}`;
  const title = g && g.title ? String(g.title) : "";
  return title ? `${id} (${title})` : id;
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
}

function warn(msg) {
  console.warn(`WARN: ${msg}`);
}

async function main() {
  let raw;
  try {
    raw = await fs.readFile(CATALOG_PATH, "utf-8");
  } catch (e) {
    warn(`Missing ${path.relative(ROOT, CATALOG_PATH)} — skipping validation (ok if you haven't added catalog metrics yet).`);
    process.exit(0);
  }

  let catalog;
  try {
    catalog = JSON.parse(raw);
  } catch (e) {
    fail(`public/arcade-games.json is not valid JSON: ${e?.message || e}`);
    process.exit(1);
  }

  const games = normalizeGames(catalog);
  if (!games.length) {
    warn(`Could not find a games list in public/arcade-games.json (expected array or {games:[...]}). Nothing to validate.`);
    process.exit(0);
  }

  let errors = 0;
  let warnings = 0;

  const seenIds = new Set();

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    const tag = fmtGame(g, i);

    // id
    if (!g || !g.id) {
      fail(`${tag}: missing game.id`);
      errors++;
      continue;
    }
    if (seenIds.has(g.id)) {
      fail(`${tag}: duplicate game.id "${g.id}"`);
      errors++;
    }
    seenIds.add(g.id);

    // gameType
    if (!g.gameType) {
      warn(`${tag}: missing gameType (recommend adding: shooter/defense/puzzle/rhythm/etc)`);
      warnings++;
    }

    // metrics array
    const metrics = Array.isArray(g.metrics) ? g.metrics : [];
    if (!metrics.length) {
      warn(`${tag}: no metrics[] declared (ok for legacy score-only games, but v3 metrics needs this)`);
      warnings++;
    }

    const metricIds = new Set();
    for (const m of metrics) {
      if (!m || typeof m.id !== "string" || !m.id.trim()) {
        fail(`${tag}: metric missing id`);
        errors++;
        continue;
      }
      if (metricIds.has(m.id)) {
        fail(`${tag}: duplicate metric id "${m.id}"`);
        errors++;
      }
      metricIds.add(m.id);

      if (!["asc", "desc"].includes(m.direction)) {
        fail(`${tag}: metric "${m.id}" has invalid direction "${m.direction}" (expected asc|desc)`);
        errors++;
      }
      if (!m.clamp || typeof m.clamp.min !== "number" || typeof m.clamp.max !== "number") {
        warn(`${tag}: metric "${m.id}" missing clamp {min,max} (recommended to reduce abuse)`);
        warnings++;
      } else if (m.clamp.min > m.clamp.max) {
        fail(`${tag}: metric "${m.id}" clamp.min > clamp.max`);
        errors++;
      }
    }

    // defaultMetric
    if (g.defaultMetric && metrics.length && !metricIds.has(g.defaultMetric)) {
      fail(`${tag}: defaultMetric "${g.defaultMetric}" not found in metrics[]`);
      errors++;
    }
    if (!g.defaultMetric && metrics.length) {
      warn(`${tag}: metrics[] exists but defaultMetric missing (UI won't know what to show first)`);
      warnings++;
    }

    // payoutMetrics weights (if present)
    const payoutMetrics = Array.isArray(g.payoutMetrics) ? g.payoutMetrics : (Array.isArray(g.skillPayoutMetrics) ? g.skillPayoutMetrics : []);
    if (payoutMetrics.length) {
      const w = sumWeights(payoutMetrics);
      if (Math.abs(1 - w) > 0.02) {
        warn(`${tag}: payoutMetrics weights sum to ${w.toFixed(3)} (recommend ~1.0)`);
        warnings++;
      }

      for (const pm of payoutMetrics) {
        if (!pm || typeof pm.id !== "string") {
          fail(`${tag}: payoutMetric missing id`);
          errors++;
          continue;
        }
        if (metrics.length && !metricIds.has(pm.id)) {
          warn(`${tag}: payoutMetric "${pm.id}" not declared in metrics[] (ok if computed server-side, but you should still list it)`);
          warnings++;
        }
      }
    }

    // In-run credit spend fairness checks
    const usesCreditsInRun = !!g.usesCreditsInRun;
    const hasSpentMetric = metricIds.has("spentInRunAC");
    const hasEfficiency = metricIds.has("efficiency") || payoutMetrics.some((pm) => pm?.id === "efficiency");
    const hasSpendCap = typeof g.rankedSpendCapAC === "number" && g.rankedSpendCapAC > 0;

    if (usesCreditsInRun || hasSpentMetric) {
      if (!hasEfficiency && !hasSpendCap) {
        warn(`${tag}: usesCreditsInRun=true (or spentInRunAC metric present) but no efficiency metric and no rankedSpendCapAC. Ranked fairness risk.`);
        warnings++;
      }
    }
  }

  const summary = `Catalog metrics validation complete: ${errors} error(s), ${warnings} warning(s).`;
  if (errors) {
    console.error(summary);
    process.exit(1);
  } else {
    console.log(summary);
    process.exit(0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
