// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

const PREFIX = 'ga:'; // Gruesøme’s Arcade

export function normAddr(address) {
  return String(address || '').toLowerCase();
}

export function profile(address) {
  return `${PREFIX}u:${normAddr(address)}:profile`;
}
export function bal(address) {
  return `${PREFIX}u:${normAddr(address)}:bal`;
}
export function promo(address) {
  return `${PREFIX}u:${normAddr(address)}:promo`;
}
export function best(address) {
  return `${PREFIX}u:${normAddr(address)}:best`;
}
export function avatar(address) {
  return `${PREFIX}u:${normAddr(address)}:avatar`;
}
export function audit(address) {
  return `${PREFIX}u:${normAddr(address)}:audit`;
}
export function runs(address, gameId) {
  return `${PREFIX}u:${normAddr(address)}:runs:${gameId}`;
}

export function promoClaimed(address, gameId) {
  return `${PREFIX}u:${normAddr(address)}:promoClaimed:${gameId}`;
}

export function run(address, runId) {
  return `${PREFIX}run:${normAddr(address)}:${runId}`;
}

export function lbDaily(gameId, ymd) {
  return `${PREFIX}lb:${gameId}:d:${ymd}`;
}
export function lbWeekly(gameId, yw) {
  return `${PREFIX}lb:${gameId}:w:${yw}`;
}
export function lbAll(gameId) {
  return `${PREFIX}lb:${gameId}:all`;
}
export function lbDailyPaid(gameId, ymd) {
  return `${PREFIX}lb:${gameId}:d:${ymd}:paid`;
}
export function lbWeeklyPaid(gameId, yw) {
  return `${PREFIX}lb:${gameId}:w:${yw}:paid`;
}
export function lbAllPaid(gameId) {
  return `${PREFIX}lb:${gameId}:all:paid`;
}
export function actDaily(ymd) {
  return `${PREFIX}act:d:${ymd}`;
}

export function actWeekly(yw) {
  return `${PREFIX}act:w:${yw}`;
}
export function actAll() {
  return `${PREFIX}act:all`;
}

// --- metric-aware leaderboards (multi-metric) ---
// Scores stored are "encoded" so that higher-is-better for Redis ZREVRANGE.
// For asc metrics (e.g., time), store negative values (e.g., -durationMs).
export function lbDailyMetric(gameId, metricId, ymd) {
  return `${PREFIX}lb:${gameId}:m:${metricId}:d:${ymd}`;
}
export function lbWeeklyMetric(gameId, metricId, yw) {
  return `${PREFIX}lb:${gameId}:m:${metricId}:w:${yw}`;
}
export function lbAllMetric(gameId, metricId) {
  return `${PREFIX}lb:${gameId}:m:${metricId}:all`;
}
export function lbDailyPaidMetric(gameId, metricId, ymd) {
  return `${PREFIX}lb:${gameId}:m:${metricId}:d:${ymd}:paid`;
}
export function lbWeeklyPaidMetric(gameId, metricId, yw) {
  return `${PREFIX}lb:${gameId}:m:${metricId}:w:${yw}:paid`;
}
export function lbAllPaidMetric(gameId, metricId) {
  return `${PREFIX}lb:${gameId}:m:${metricId}:all:paid`;
}

// --- weekly payout epoch keys (UTC ISO week) ---
export function weekPot(yw) {
  return `${PREFIX}week:${yw}:potCents`; // String integer cents reserved from dailies
}
export function weekSummary(yw) {
  return `${PREFIX}epoch:w:${yw}:summary`; // Hash summary fields
}
export function weekClaims(yw) {
  return `${PREFIX}epoch:w:${yw}:claims`; // Hash: address -> JSON
}
export function weekClaimed(yw) {
  return `${PREFIX}epoch:w:${yw}:claimed`; // Set: claimed addresses
}
export function weeksList() {
  return `${PREFIX}weeks:list`; // List of settled week ids
}

export function proposalsList() {
  return `${PREFIX}proposals:list`;
}
export function proposal(id) {
  return `${PREFIX}proposal:${id}`;
}
export function proposalSupport(id) {
  return `${PREFIX}proposal:${id}:support`;
}
export function proposalRate(address) {
  return `${PREFIX}u:${normAddr(address)}:proposalRate`;
}
export function supportRate(address) {
  return `${PREFIX}u:${normAddr(address)}:supportRate`;
}

// --- economy pots / epochs ---
export function spentDay(ymd) {
  return `${PREFIX}spent:d:${ymd}`; // Hash: gameId -> paidSpentAC
}
export function opsDay(ymd) {
  return `${PREFIX}ops:d:${ymd}`; // Hash: gameId -> opsAC
}
export function badgeDaily(ymd) {
  return `${PREFIX}badge:d:${ymd}`; // Set: addresses who minted daily badge
}

export function epochSummary(ymd) {
  return `${PREFIX}epoch:d:${ymd}:summary`; // Hash summary fields
}
export function epochClaims(ymd) {
  return `${PREFIX}epoch:d:${ymd}:claims`; // Hash: address -> JSON
}
export function epochClaimed(ymd) {
  return `${PREFIX}epoch:d:${ymd}:claimed`; // Set: claimed addresses
}
export function epochsList() {
  return `${PREFIX}epochs:list`; // List of settled epoch ids
}
