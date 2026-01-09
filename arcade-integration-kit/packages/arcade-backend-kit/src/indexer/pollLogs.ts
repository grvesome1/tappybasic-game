// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import type { Provider } from "ethers";
import type { PollRange } from "./types";

export type PollLogsParams = {
  provider: Provider;
  address: string;
  topics: string[] | string[][];
  range: PollRange;
};

export async function pollLogs(params: PollLogsParams) {
  const logs = await params.provider.getLogs({
    address: params.address,
    fromBlock: params.range.fromBlock,
    toBlock: params.range.toBlock,
    topics: params.topics as any
  });

  return logs;
}
