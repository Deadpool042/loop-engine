import type { LoopRunFailure, LoopRunResult } from "./types.js";

export const DURABLE_EXECUTION_SCHEMA_VERSION = 1 as const;
export const DURABLE_EXECUTION_STATUSES = [
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
export type DurableExecutionStatus =
  (typeof DURABLE_EXECUTION_STATUSES)[number];

export type DurableExecutionEvent = Readonly<{
  sequence: number;
  at: string;
  type:
    | "lease_acquired"
    | "lease_recovered"
    | "cancellation_requested"
    | "completed"
    | "failed"
    | "cancelled";
  owner: string | null;
}>;

export type DurableExecutionRecord = Readonly<{
  schemaVersion: typeof DURABLE_EXECUTION_SCHEMA_VERSION;
  revision: number;
  idempotencyKey: string;
  project: string;
  status: DurableExecutionStatus;
  attempt: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  cancellationRequested: boolean;
  createdAt: string;
  updatedAt: string;
  result: LoopRunResult | null;
  failure: LoopRunFailure | null;
  events: readonly DurableExecutionEvent[];
}>;

export type DurableExecutionStore = Readonly<{
  load(idempotencyKey: string): Promise<DurableExecutionRecord | null>;
  save(
    record: DurableExecutionRecord,
    expectedRevision: number | null,
  ): Promise<boolean>;
}>;

export type DurableExecutionRequest = Readonly<{
  idempotencyKey: string;
  project: string;
  owner: string;
  leaseDurationMs: number;
}>;

export type DurableExecutionResult =
  | Readonly<{
      status: "executed" | "replayed";
      record: DurableExecutionRecord;
    }>
  | Readonly<{
      status: "rejected";
      code:
        | "invalid_request"
        | "execution_in_progress"
        | "record_conflict"
        | "project_mismatch";
      record: DurableExecutionRecord | null;
      details: readonly string[];
    }>;

export type DurableExecutionCancellationResult =
  | Readonly<{ status: "requested" | "already_terminal"; record: DurableExecutionRecord }>
  | Readonly<{
      status: "rejected";
      code: "not_found" | "record_conflict" | "invalid_request";
      details: readonly string[];
    }>;
