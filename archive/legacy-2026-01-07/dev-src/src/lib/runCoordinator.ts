// built by gruesøme
// sig(b64)=YnVpbHQgYnkgZ3J1ZXPDuG1l

/**
 * TypeScript interface for the RunCoordinator.
 *
 * Runtime implementation ships from:
 * - /public/_lib/runCoordinator.js
 */

export type RequestRunInput = {
  gameId: string;
  desiredRunType?: string;
};

export type RequestRunResult =
  | { granted: true; payload: unknown }
  | { granted: false; payload: { gameId: string; reason: string; [k: string]: unknown } };

export type CompleteRunInput = {
  gameId: string;
  runId: string;
  durationMs: number;
  metrics?: Record<string, unknown> | null;
  metricId?: string;
  metricValue?: number | null;
};

export class RunCoordinator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(_hooks: any) {
    throw new Error('This TS file is not executed at runtime. Use /public/_lib/runCoordinator.js');
  }

  async requestRun(_req: RequestRunInput): Promise<RequestRunResult> {
    throw new Error('not implemented');
  }

  async completeRun(_req: CompleteRunInput): Promise<unknown> {
    throw new Error('not implemented');
  }
}
