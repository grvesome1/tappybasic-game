#!/usr/bin/env node
/**
 * apply-game-profile.mjs
 *
 * Applies a game profile (metrics + fairness flags) to public/arcade-games.json
 * and ensures public/arcade-metrics-library.json contains required metric IDs.
 *
 * Usage examples:
 *   node tools/apply-game-profile.mjs --gameId=stormhouse2 --profile=tools/profiles/defense_econ_sth2.json --out=public/arcade-games.preview.json
 *   node tools/apply-game-profile.mjs --gameId=stormhouse2 --profile=tools/profiles/defense_econ_sth2.json --add --write
 *
 * Notes:
 * - Does NOT touch public/index.html
 * - Safe: writes preview unless --write is provided
 *
 * built by gruesøme
 * SIG_ENC_XOR5A_UTF8_HEX=382f33362e7a38237a3d282f3f2999e2373f
 */

import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();

function argMap(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) out[m[1]] = m[2];
    else if (a.startsWith("--")) out[a.slice(2)] = true;
  }
  return out;
}

function readJson(p) {
  const s = fs.readFileSync(p, "utf8");
  return JSON.parse(s);
}

function writeJson(p, obj) {
  const s = JSON.stringify(obj, null, 2) + "\n";
  fs.writeFileSync(p, s, "utf8");
}

function isObj(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

function loadGames(catalog) {
  // Supports:
  // - Array of games
  // - { games: [...] }
  // - { <gameId>: { ... }, ... } (map form)
  if (Array.isArray(catalog)) return { kind: "array", games: catalog, wrap: (games) => games };
  if (isObj(catalog) && Array.isArray(catalog.games)) return { kind: "obj.games", games: catalog.games, wrap: (games) => ({ ...catalog, games }) };

  if (isObj(catalog)) {
    const entries = Object.entries(catalog).filter(([, v]) => isObj(v) && (v.gameId || v.id));
    if (entries.length) {
      const games = entries.map(([, v]) => v);
      const preserved = Object.entries(catalog).filter(([, v]) => !(isObj(v) && (v.gameId || v.id)));
      return {
        kind: "map",
        games,
        wrap: (newGames) => {
          const out = {};
          for (const g of newGames) {
            const id = g.gameId || g.id;
            if (!id) continue;
            out[id] = g;
          }
          for (const [k, v] of preserved) out[k] = v;
          return out;
        }
      };
    }
  }

  return { kind: "unknown", games: [], wrap: (games) => games };
}

function normalizeMetricSpec(m) {
  // allow shorthand strings, but prefer objects
  if (typeof m === "string") return { id: m, label: m, format: "int", dir: "desc", payoutEligible: false };
  if (!isObj(m)) throw new Error("Invalid metric spec (must be object or string)");
  if (!m.id) throw new Error("Metric spec missing id");
  const out = { ...m };
  if (!out.label) out.label = out.id;
  if (!out.format) out.format = "int";
  out.dir = (out.dir || out.direction || "desc");
  delete out.direction;
  return out;
}

function ensureLibraryMetric(lib, id, def) {
  // Supports:
  // - { metrics: [{id,...}] }
  // - [{id,...}]
  // - { <id>: { ... } }
  if (!lib) return lib;

  if (Array.isArray(lib)) {
    if (!lib.some((m) => m && m.id === id)) lib.push({ id, ...def });
    return lib;
  }
  if (isObj(lib) && Array.isArray(lib.metrics)) {
    if (!lib.metrics.some((m) => m && m.id === id)) lib.metrics.push({ id, ...def });
    return lib;
  }
  if (isObj(lib)) {
    if (!lib[id]) lib[id] = { id, ...def };
    return lib;
  }
  return lib;
}

function main() {
  const args = argMap(process.argv.slice(2));
  const gameId = args.gameId || args.id;
  const profilePath = args.profile || "tools/profiles/defense_econ_sth2.json";
  const write = !!args.write;
  const addIfMissing = !!args.add;
  const outPath = args.out || null;

  if (!gameId) {
    console.error("ERROR: missing --gameId=...");
    process.exit(1);
  }

  const catalogPath = path.join(CWD, "public", "arcade-games.json");
  const libraryPath = path.join(CWD, "public", "arcade-metrics-library.json");
  const profileAbs = path.isAbsolute(profilePath) ? profilePath : path.join(CWD, profilePath);

  if (!fs.existsSync(catalogPath)) {
    console.error(`ERROR: missing ${catalogPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(profileAbs)) {
    console.error(`ERROR: missing profile file: ${profileAbs}`);
    process.exit(1);
  }

  const catalog = readJson(catalogPath);
  const container = loadGames(catalog);
  let games = container.games.slice();

  const profile = readJson(profileAbs);
  const defaults = profile.defaults || {};
  const libAdds = profile.libraryAdditions || {};

  let idx = games.findIndex((g) => (g && ((g.gameId || g.id) === gameId)));
  if (idx === -1) {
    if (!addIfMissing) {
      console.error(`ERROR: gameId "${gameId}" not found in public/arcade-games.json. Re-run with --add to create a placeholder entry.`);
      process.exit(1);
    }
    const placeholder = {
      gameId,
      title: profile.title || "Storm the House 2 (Remaster)",
      path: profile.path || "/games/stormhouse2/index.html",
      payoutEligible: true,
      runCostAC: 1
    };
    games.push(placeholder);
    idx = games.length - 1;
    console.log(`Created placeholder game entry for ${gameId}.`);
  }

  const game = { ...games[idx] };

  // Apply profile fields
  if (defaults.gameType) game.gameType = defaults.gameType;
  if (typeof defaults.usesCreditsInRun === "boolean") game.usesCreditsInRun = defaults.usesCreditsInRun;
  if (Number.isFinite(defaults.rankedSpendCapAC)) game.rankedSpendCapAC = defaults.rankedSpendCapAC;
  if (defaults.notes) game.notes = defaults.notes;

  const metrics = Array.isArray(defaults.metrics) ? defaults.metrics : [];
  const defaultMetric = defaults.defaultMetric || game.defaultMetric || "score";
  if (metrics.length) {
    game.metrics = metrics.map(normalizeMetricSpec);
    game.defaultMetric = defaultMetric;
  } else {
    if (!game.defaultMetric) game.defaultMetric = defaultMetric;
  }

  games[idx] = game;

  // Update library (best-effort; do not create if missing)
  if (fs.existsSync(libraryPath)) {
    const lib = readJson(libraryPath);
    for (const [mid, def] of Object.entries(libAdds)) {
      ensureLibraryMetric(lib, mid, def);
    }
    if (write) {
      writeJson(libraryPath, lib);
      console.log("Updated public/arcade-metrics-library.json with missing metric defs.");
    } else {
      const libOut = outPath
        ? path.join(path.dirname(path.join(CWD, outPath)), "arcade-metrics-library.preview.json")
        : path.join(CWD, "public", "arcade-metrics-library.preview.json");
      writeJson(libOut, lib);
      console.log(`Wrote library preview: ${path.relative(CWD, libOut)}`);
    }
  } else {
    console.warn("WARN: public/arcade-metrics-library.json not found; skipping library merge");
  }

  // Write catalog
  const finalCatalog = container.wrap(games);
  const dest = outPath ? path.join(CWD, outPath) : catalogPath;

  if (write) {
    writeJson(dest, finalCatalog);
    console.log(`Wrote: ${path.relative(CWD, dest)}`);
  } else {
    const preview = outPath ? dest : path.join(CWD, "public", "arcade-games.preview.json");
    writeJson(preview, finalCatalog);
    console.log(`Wrote preview: ${path.relative(CWD, preview)} (use --write to overwrite public/arcade-games.json)`);
  }

  console.log("\nSummary:");
  console.log(`- gameId: ${gameId}`);
  console.log(`- gameType: ${game.gameType || "—"}`);
  console.log(`- usesCreditsInRun: ${String(!!game.usesCreditsInRun)}`);
  console.log(`- rankedSpendCapAC: ${Number.isFinite(game.rankedSpendCapAC) ? game.rankedSpendCapAC : "—"}`);
  console.log(`- defaultMetric: ${game.defaultMetric || "—"}`);
  console.log(`- metrics: ${(game.metrics && Array.isArray(game.metrics)) ? game.metrics.map(m => (typeof m === "string" ? m : m.id)).join(", ") : "—"}`);
}

main();
