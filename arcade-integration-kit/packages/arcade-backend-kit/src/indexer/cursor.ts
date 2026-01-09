// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import type { BlockCursor, PollRange } from "./types";

export function makeDefaultCursor(params?: {
  startBlock?: number;
  confirmations?: number;
  rewindBlocks?: number;
}): BlockCursor {
  return {
    nextBlock: Math.max(0, Number(params?.startBlock ?? 0)),
    confirmations: Math.max(0, Number(params?.confirmations ?? 12)),
    rewindBlocks: Math.max(0, Number(params?.rewindBlocks ?? 32)),
    updatedAt: new Date().toISOString()
  };
}

export function computeSafePollRange(params: {
  cursor: BlockCursor;
  latestBlock: number;
  maxBatchBlocks?: number;
}): PollRange | null {
  const confirmations = Math.max(0, params.cursor.confirmations);
  const finalizedHead = params.latestBlock - confirmations;
  if (finalizedHead < 0) return null;

  const rewind = Math.max(0, params.cursor.rewindBlocks);
  const baseFrom = Math.max(0, params.cursor.nextBlock - rewind);

  const maxBatch = Math.max(1, Number(params.maxBatchBlocks ?? 2_000));
  const toBlock = Math.min(finalizedHead, baseFrom + maxBatch - 1);

  if (toBlock < baseFrom) return null;

  return { fromBlock: baseFrom, toBlock };
}

export function advanceCursor(cursor: BlockCursor, nextBlock: number): BlockCursor {
  return {
    ...cursor,
    nextBlock: Math.max(0, nextBlock),
    updatedAt: new Date().toISOString()
  };
}
