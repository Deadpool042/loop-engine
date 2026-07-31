import type { DurableExecutionRecord } from "./durable-execution.js";

export type DurableExecutionMaintenanceStatus =
  | "active"
  | "recoverable"
  | "terminal";

export type DurableExecutionInventory = Readonly<{
  list(): Promise<readonly DurableExecutionRecord[]>;
}>;

export type DurableExecutionMaintenanceEntry = Readonly<{
  idempotencyKey: string;
  project: string;
  status: DurableExecutionMaintenanceStatus;
  executionStatus: DurableExecutionRecord["status"];
  revision: number;
  attempt: number;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  cancellationRequested: boolean;
}>;

export type DurableExecutionMaintenanceReport = Readonly<{
  observedAt: string;
  total: number;
  active: number;
  recoverable: number;
  terminal: number;
  entries: readonly DurableExecutionMaintenanceEntry[];
}>;

export type DurableExecutionMaintenanceAction = Readonly<{
  apply(entry: DurableExecutionMaintenanceEntry): Promise<void>;
}>;

export type DurableExecutionMaintenanceRunResult = Readonly<{
  report: DurableExecutionMaintenanceReport;
  applied: readonly string[];
  failed: readonly string[];
}>;

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function classify(
  record: DurableExecutionRecord,
  observedAt: string,
): DurableExecutionMaintenanceStatus {
  if (record.status !== "running") return "terminal";
  if (
    record.leaseExpiresAt !== null &&
    validTimestamp(record.leaseExpiresAt) &&
    record.leaseExpiresAt <= observedAt
  ) {
    return "recoverable";
  }
  return "active";
}

export async function inspectDurableExecutions(
  inventory: DurableExecutionInventory,
  now: () => string = () => new Date().toISOString(),
): Promise<DurableExecutionMaintenanceReport> {
  const observedAt = now();
  if (!validTimestamp(observedAt)) {
    throw new Error("Durable execution maintenance requires a valid timestamp.");
  }

  const entries = (await inventory.list())
    .map((record): DurableExecutionMaintenanceEntry =>
      Object.freeze({
        idempotencyKey: record.idempotencyKey,
        project: record.project,
        status: classify(record, observedAt),
        executionStatus: record.status,
        revision: record.revision,
        attempt: record.attempt,
        leaseOwner: record.leaseOwner,
        leaseExpiresAt: record.leaseExpiresAt,
        cancellationRequested: record.cancellationRequested,
      }),
    )
    .sort((left, right) =>
      left.idempotencyKey.localeCompare(right.idempotencyKey),
    );

  const counts = entries.reduce(
    (result, entry) => ({
      ...result,
      [entry.status]: result[entry.status] + 1,
    }),
    { active: 0, recoverable: 0, terminal: 0 },
  );

  return Object.freeze({
    observedAt,
    total: entries.length,
    active: counts.active,
    recoverable: counts.recoverable,
    terminal: counts.terminal,
    entries: Object.freeze(entries),
  });
}

export async function runDurableExecutionMaintenance(
  inventory: DurableExecutionInventory,
  action: DurableExecutionMaintenanceAction,
  now: () => string = () => new Date().toISOString(),
): Promise<DurableExecutionMaintenanceRunResult> {
  const report = await inspectDurableExecutions(inventory, now);
  const applied: string[] = [];
  const failed: string[] = [];

  for (const entry of report.entries) {
    if (entry.status === "active") continue;
    try {
      await action.apply(entry);
      applied.push(entry.idempotencyKey);
    } catch {
      failed.push(entry.idempotencyKey);
    }
  }

  return Object.freeze({
    report,
    applied: Object.freeze(applied),
    failed: Object.freeze(failed),
  });
}
