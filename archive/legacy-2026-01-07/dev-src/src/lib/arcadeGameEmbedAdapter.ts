// built by gruesøme
// sig(b64)=YnVpbHQgYnkgZ3J1ZXPDuG1l

/**
 * TypeScript interface for the Universal Game Embed Adapter.
 *
 * NOTE: This repo currently ships static ESM runtime code from:
 * - /public/_lib/arcadeGameEmbedAdapter.js
 *
 * This file exists as a typed "source of truth" for future build pipelines.
 */

export const standardBridgeMessageTypes = {
  READY: 'ARCADE:READY',
  SYNC: 'ARCADE:SYNC',
  REQUEST_RUN: 'ARCADE:REQUEST_RUN',
  RUN_GRANTED: 'ARCADE:RUN_GRANTED',
  RUN_DENIED: 'ARCADE:RUN_DENIED',
  RUN_RESULT: 'ARCADE:RUN_RESULT'
} as const;

export type StandardBridgeMessageType = typeof standardBridgeMessageTypes[keyof typeof standardBridgeMessageTypes];

export type ReadyPayload = {
  gameId: string;
  version?: string;
  metricsVersion?: string;
};

export type SyncPayloadV1 = {
  address: string;
  credits: { paid: number; promo: number };
  membership: string | null;
  avatar: unknown | null;
};

export type RequestRunPayload = {
  gameId: string;
  desiredRunType: 'free' | 'paid' | 'promoOnly' | string;
};

export type RunGrantedPayload = {
  gameId: string;
  runId: string;
  runType: string;
  cost: { paidAC: number; promoAC: number };
};

export type RunDeniedPayload = {
  gameId: string;
  reason: string;
};

export type RunResultPayload = {
  gameId: string;
  runId: string;
  durationMs: number;
  metrics?: Record<string, unknown>;
  metricId?: string;
  metricValue?: number;
};

export type EmbedCatalogPolicy = {
  runTypePolicy?: 'free' | 'paid' | 'promoOnly';
  sandboxPolicy?: 'strict' | 'relaxed';
  allowList?: string[];
};

export type EmbedGameConfig = {
  id: string;
  url: string;
  title?: string;
  defaultMetric?: string;
  metrics?: string[];
} & EmbedCatalogPolicy;

export function validateMessageOrigin(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes(origin);
}

export type GameFrameController = {
  mount(nextGame?: EmbedGameConfig): boolean;
  unmount(): void;
  send(type: string, payload?: unknown): boolean;
  sync(): boolean;
  handleMessageEvent(ev: MessageEvent): boolean;
  getState(): { mounted: boolean; ready: boolean; gameId: string; targetOrigin: string };
};

export type CreateGameFrameControllerOptions = {
  iframe: HTMLIFrameElement;
  game: EmbedGameConfig;
  getSyncPayload?: (game: EmbedGameConfig) => unknown;
  onReady?: (info: { gameId: string; version?: string; metricsVersion?: string; origin: string }) => void;
  onSync?: (info: { gameId: string; payload: unknown }) => void;
  onRequestRun?: (req: RequestRunPayload) => void;
  onRunResult?: (res: RunResultPayload & { legacyScore?: number | null }) => void;
  onError?: (err: { code: string; details?: unknown }) => void;
};

export function createGameFrameController(_options: CreateGameFrameControllerOptions): GameFrameController {
  throw new Error('This TS file is not executed at runtime. Use /public/_lib/arcadeGameEmbedAdapter.js');
}
