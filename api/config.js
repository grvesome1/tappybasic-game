// built by gruesøme
// SIG_ENC_XOR5A_HEX=382f33362e7a38237a3d282f3f29a2373f

function intFromEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function chainConfig() {
  // Default to Linea Sepolia for staging/testnet.
  const chainId = intFromEnv('LINEA_CHAIN_ID', 59141);
  const chainIdHex = '0x' + chainId.toString(16);
  const rpcUrl = String(process.env.LINEA_RPC_URL || 'https://rpc.sepolia.linea.build');
  const explorerUrl = String(process.env.LINEA_EXPLORER_URL || 'https://sepolia.lineascan.build');
  const chainName = String(process.env.LINEA_CHAIN_NAME || (chainId === 59144 ? 'Linea' : 'Linea Sepolia'));

  return {
    chainId,
    chainIdHex,
    chainName,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [rpcUrl],
    blockExplorerUrls: [explorerUrl],
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

    const chain = chainConfig();
    const walletConnectProjectId = String(process.env.WALLETCONNECT_PROJECT_ID || '').trim();

    return res.status(200).json({
      ok: true,
      version: String(process.env.APP_VERSION || 'v1.1'),
      chain,
      walletconnect: {
        projectId: walletConnectProjectId,
        relayWsUrl: 'wss://relay.walletconnect.com',
        providerUmd: 'https://unpkg.com/@walletconnect/ethereum-provider@2.12.2/dist/index.umd.js',
      },
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      error: (e && e.message) ? String(e.message) : 'error',
    });
  }
}
