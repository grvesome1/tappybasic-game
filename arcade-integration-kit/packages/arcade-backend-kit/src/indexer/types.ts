// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

export type BlockCursor = {
  nextBlock: number;
  confirmations: number;
  rewindBlocks: number;
  updatedAt: string;
};

export type PollRange = {
  fromBlock: number;
  toBlock: number;
};

export type LogPointer = {
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
};

export type RouterPaymentExecuted = LogPointer & {
  eventName: "PaymentExecuted";
  quoteId: string;
  buyer: string;
  sku: string;
  kind: number;
  payToken: string;
  amountIn: bigint;
  usdCents: bigint;
  credits: bigint;
  tier: number;
  opsAmount: bigint;
  dailyPotAmount: bigint;
  weeklyPotAmount: bigint;
  treasuryAmount: bigint;
  opsRouted: bigint;
  treasuryRouted: bigint;
  directPotFunding: boolean;
  ref: string;
};

export type RouterReceiptEvent = RouterPaymentExecuted;
