import type { DurableExecutionRecord } from "../../../src/loop/durable-execution.js";
import type { LoopRunResult } from "../../../src/loop/types.js";

export function syntheticRecord(
  key: string,
  owner: string,
  revision = 1,
): DurableExecutionRecord {
  const at = new Date().toISOString();
  return Object.freeze({
    schemaVersion: 1 as const,
    revision,
    idempotencyKey: key,
    project: "synthetic",
    status: "running" as const,
    attempt: 1,
    leaseOwner: owner,
    leaseExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    cancellationRequested: false,
    createdAt: at,
    updatedAt: at,
    progress: null,
    progressEvents: Object.freeze([]),
    result: null,
    failure: null,
    events: Object.freeze([
      Object.freeze({
        sequence: 1,
        at,
        type: "lease_acquired" as const,
        owner,
      }),
    ]),
  });
}

export function completedResult(): LoopRunResult {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-synthetic",
    project: "synthetic",
    mode: "execute",
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    candidate: null,
    steps: Object.freeze([]),
    validation: null,
    modifiedFiles: Object.freeze([]),
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
  }) as LoopRunResult;
}
