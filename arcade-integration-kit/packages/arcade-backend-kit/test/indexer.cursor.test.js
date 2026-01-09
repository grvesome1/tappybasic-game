// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

const test = require("node:test");
const assert = require("node:assert/strict");

const { makeDefaultCursor, computeSafePollRange, advanceCursor } = require("../dist/index.js");

test("cursor: computeSafePollRange respects confirmations", () => {
  const cursor = makeDefaultCursor({ startBlock: 0, confirmations: 10, rewindBlocks: 0 });
  const range = computeSafePollRange({ cursor, latestBlock: 9, maxBatchBlocks: 1000 });
  assert.equal(range, null);
});

test("cursor: computeSafePollRange rewinds and batches", () => {
  const cursor = makeDefaultCursor({ startBlock: 100, confirmations: 0, rewindBlocks: 32 });
  const range = computeSafePollRange({ cursor, latestBlock: 1000, maxBatchBlocks: 100 });
  assert.deepEqual(range, { fromBlock: 68, toBlock: 167 });
});

test("cursor: advanceCursor sets nextBlock", () => {
  const c = makeDefaultCursor({ startBlock: 5, confirmations: 0, rewindBlocks: 0 });
  const next = advanceCursor(c, 123);
  assert.equal(next.nextBlock, 123);
});
