// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import { Interface } from "ethers";
import type { Provider } from "ethers";

import { advanceCursor, computeSafePollRange, makeDefaultCursor } from "./cursor";
import { pollLogs } from "./pollLogs";
import type { CursorStore, IdempotencyStore } from "./stores";
import type { BlockCursor, RouterReceiptEvent } from "./types";

const ROUTER_EVENTS_ABI = [
  // Canonical receipt event
  "event PaymentExecuted(bytes32 indexed quoteId,address indexed buyer,bytes32 indexed sku,uint8 kind,address payToken,uint256 amountIn,uint256 usdCents,uint256 credits,uint8 tier,uint256 opsAmount,uint256 dailyPotAmount,uint256 weeklyPotAmount,uint256 treasuryAmount,uint256 opsRouted,uint256 treasuryRouted,bool directPotFunding,bytes32 ref)",
  // Optional convenience events (not indexed here by default)
  "event CreditsPurchased(bytes32 indexed quoteId,address indexed buyer,uint256 credits,uint256 usdCents,bytes32 ref)",
  "event ProMinted(bytes32 indexed quoteId,address indexed buyer,uint256 tokenId,uint8 tier)",
  "event ProRenewed(bytes32 indexed quoteId,address indexed buyer,uint8 tier,uint64 newExpiresAt)"
];

const routerIface = new Interface(ROUTER_EVENTS_ABI);
const paymentExecutedFragment = routerIface.getEvent("PaymentExecuted");
if (!paymentExecutedFragment) {
  throw new Error("Router ABI missing PaymentExecuted event");
}
const PAYMENT_EXECUTED_TOPIC = paymentExecutedFragment.topicHash;

export type IndexRouterReceiptsParams = {
  provider: Provider;
  chainId?: number;
  routerAddress: string;

  // Storage
  cursorStore: CursorStore;
  idempotencyStore: IdempotencyStore;
  scope: string; // e.g. `lineaMainnet:router-receipts`

  // Optional controls
  startBlock?: number;
  confirmations?: number;
  rewindBlocks?: number;
  maxBatchBlocks?: number;

  onEvent: (evt: RouterReceiptEvent) => Promise<void>;
};

export type IndexRouterReceiptsResult = {
  processed: number;
  range: { fromBlock: number; toBlock: number } | null;
  cursor: BlockCursor;
};

function makeIdempotencyKey(params: { chainId: number; router: string; txHash: string; logIndex: number }): string {
  return `${params.chainId}:${params.router.toLowerCase()}:${params.txHash.toLowerCase()}:${params.logIndex}`;
}

function coerceBigint(v: any): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") return BigInt(v);
  return BigInt(String(v));
}

export async function indexRouterReceipts(params: IndexRouterReceiptsParams): Promise<IndexRouterReceiptsResult> {
  const net = await params.provider.getNetwork();
  const chainId = Number(params.chainId ?? net.chainId);

  const existing = await params.cursorStore.get(params.scope);
  const cursor = existing ??
    makeDefaultCursor({
      startBlock: params.startBlock,
      confirmations: params.confirmations,
      rewindBlocks: params.rewindBlocks
    });

  const latestBlock = await params.provider.getBlockNumber();
  const range = computeSafePollRange({ cursor, latestBlock, maxBatchBlocks: params.maxBatchBlocks });

  if (!range) {
    // Nothing finalized yet.
    return { processed: 0, range: null, cursor };
  }

  const logs = await pollLogs({
    provider: params.provider,
    address: params.routerAddress,
    topics: [PAYMENT_EXECUTED_TOPIC],
    range
  });

  let processed = 0;

  for (const log of logs) {
    if (log.topics?.[0] !== PAYMENT_EXECUTED_TOPIC) continue;

    const key = makeIdempotencyKey({ chainId, router: params.routerAddress, txHash: log.transactionHash, logIndex: log.index });
    if (await params.idempotencyStore.has(key)) continue;

    const parsed = routerIface.parseLog({ topics: log.topics as string[], data: log.data });
    if (!parsed || parsed.name !== "PaymentExecuted") continue;

    const evt: RouterReceiptEvent = {
      eventName: "PaymentExecuted",
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      logIndex: log.index,
      quoteId: String(parsed.args.quoteId),
      buyer: String(parsed.args.buyer),
      sku: String(parsed.args.sku),
      kind: Number(parsed.args.kind),
      payToken: String(parsed.args.payToken),
      amountIn: coerceBigint(parsed.args.amountIn),
      usdCents: coerceBigint(parsed.args.usdCents),
      credits: coerceBigint(parsed.args.credits),
      tier: Number(parsed.args.tier),
      opsAmount: coerceBigint(parsed.args.opsAmount),
      dailyPotAmount: coerceBigint(parsed.args.dailyPotAmount),
      weeklyPotAmount: coerceBigint(parsed.args.weeklyPotAmount),
      treasuryAmount: coerceBigint(parsed.args.treasuryAmount),
      opsRouted: coerceBigint(parsed.args.opsRouted),
      treasuryRouted: coerceBigint(parsed.args.treasuryRouted),
      directPotFunding: Boolean(parsed.args.directPotFunding),
      ref: String(parsed.args.ref)
    };

    await params.onEvent(evt);
    await params.idempotencyStore.put({ key, createdAt: new Date().toISOString() });
    processed++;
  }

  const nextCursor = advanceCursor(cursor, range.toBlock + 1);
  await params.cursorStore.set(params.scope, nextCursor);

  return { processed, range, cursor: nextCursor };
}
