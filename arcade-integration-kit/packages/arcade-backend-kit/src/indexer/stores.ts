// built by gruesøme
// sig (xor5a): 0x382f33362e7a38237a3d282f3f29a2373f

import type { BlockCursor } from "./types";

export type IdempotencyRecord = {
  key: string;
  createdAt: string;
  meta?: Record<string, unknown>;
};

export interface IdempotencyStore {
  has(key: string): Promise<boolean>;
  put(record: IdempotencyRecord): Promise<void>;
}

export interface CursorStore {
  get(scope: string): Promise<BlockCursor | null>;
  set(scope: string, cursor: BlockCursor): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly seen = new Map<string, IdempotencyRecord>();

  async has(key: string): Promise<boolean> {
    return this.seen.has(key);
  }

  async put(record: IdempotencyRecord): Promise<void> {
    this.seen.set(record.key, record);
  }
}

export class InMemoryCursorStore implements CursorStore {
  private readonly cursors = new Map<string, BlockCursor>();

  async get(scope: string): Promise<BlockCursor | null> {
    return this.cursors.get(scope) ?? null;
  }

  async set(scope: string, cursor: BlockCursor): Promise<void> {
    this.cursors.set(scope, cursor);
  }
}
