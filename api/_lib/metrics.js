// Metrics are best-effort; production can wire this up to Redis/KV later.

export async function bump(_name, _status) {
  return true;
}
