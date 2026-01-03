// PoH verification placeholder.
//
// In production, wire this to your PoH oracle / allowlist.

export async function checkPoh(_address) {
  // Allow simple override for demos.
  if (process.env.POH_ALLOW_ALL === '1') return true;
  return false;
}
