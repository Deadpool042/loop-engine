import { DEFAULT_QUOTA_RESERVE } from "./defaults.js";
import type { QuotaReservePolicy } from "./types.js";

export const QUOTA_SNAPSHOT_FRESHNESS = ["fresh", "unknown_or_stale"] as const;
export type QuotaSnapshotFreshness = (typeof QUOTA_SNAPSHOT_FRESHNESS)[number];

export type QuotaWindow = Readonly<{
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetAt: number;
}>;

export type ProviderQuotaSnapshot = Readonly<{
  provider: string;
  plan: string | null;
  windows: readonly QuotaWindow[];
  constrainingWindow: QuotaWindow | null;
}>;

export type OpenClawQuotaSnapshot = Readonly<{
  schemaVersion: 1;
  source: "openclaw_usage_status";
  updatedAt: number;
  ageMs: number;
  freshness: "fresh";
  providers: readonly ProviderQuotaSnapshot[];
}>;

export type OpenClawQuotaSnapshotResult =
  | Readonly<{ status: "available"; snapshot: OpenClawQuotaSnapshot }>
  | Readonly<{
      status: "unknown";
      reason:
        | "invalid_snapshot"
        | "unsupported_source"
        | "stale_snapshot"
        | "missing_timestamp";
    }>;

export type QuotaReserveEvaluation = Readonly<{
  repairPercent: number;
  ciPercent: number;
  emergencyPercent: number;
  totalPercent: number;
}>;

export type QuotaAvailabilityAfterReserve = Readonly<{
  remainingPercent: number;
  reserve: QuotaReserveEvaluation;
  usablePercent: number;
  reserveBinding: boolean;
}>;

export function evaluateQuotaReservePolicy(
  reserve: QuotaReservePolicy = DEFAULT_QUOTA_RESERVE,
): QuotaReserveEvaluation {
  const values = [
    reserve.repairPercent,
    reserve.ciPercent,
    reserve.emergencyPercent,
  ];
  if (
    values.some(
      (value) => !Number.isFinite(value) || value < 0 || value > 100,
    )
  ) {
    throw new Error("Invalid quota reserve percentage.");
  }

  const totalPercent = values.reduce((sum, value) => sum + value, 0);
  if (totalPercent > 100) {
    throw new Error("Quota reserve total exceeds 100 percent.");
  }

  return Object.freeze({
    repairPercent: reserve.repairPercent,
    ciPercent: reserve.ciPercent,
    emergencyPercent: reserve.emergencyPercent,
    totalPercent,
  });
}

export function applyQuotaReserve(
  remainingPercent: number,
  reserve: QuotaReservePolicy = DEFAULT_QUOTA_RESERVE,
): QuotaAvailabilityAfterReserve {
  if (
    !Number.isFinite(remainingPercent) ||
    remainingPercent < 0 ||
    remainingPercent > 100
  ) {
    throw new Error("Invalid remaining quota percentage.");
  }

  const evaluatedReserve = evaluateQuotaReservePolicy(reserve);
  const usablePercent = Math.max(
    0,
    remainingPercent - evaluatedReserve.totalPercent,
  );

  return Object.freeze({
    remainingPercent,
    reserve: evaluatedReserve,
    usablePercent,
    reserveBinding: usablePercent < remainingPercent,
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeWindow(value: unknown): QuotaWindow | null {
  const input = record(value);
  if (!input || typeof input.label !== "string" || !input.label.trim()) return null;

  const usedPercent = finiteNumber(input.usedPercent);
  const resetAt = finiteNumber(input.resetAt);
  if (usedPercent === null || resetAt === null || usedPercent < 0 || usedPercent > 100) {
    return null;
  }

  return Object.freeze({
    label: input.label.trim(),
    usedPercent,
    remainingPercent: 100 - usedPercent,
    resetAt,
  });
}

export function selectConstrainingQuotaWindow(
  windows: readonly QuotaWindow[],
): QuotaWindow | null {
  if (windows.length === 0) return null;

  return [...windows].sort((left, right) => {
    if (left.remainingPercent !== right.remainingPercent) {
      return left.remainingPercent - right.remainingPercent;
    }
    if (left.resetAt !== right.resetAt) return right.resetAt - left.resetAt;
    return left.label.localeCompare(right.label);
  })[0] ?? null;
}

function normalizeProvider(value: unknown): ProviderQuotaSnapshot | null {
  const input = record(value);
  if (!input || typeof input.provider !== "string" || !input.provider.trim()) {
    return null;
  }

  const windows = (Array.isArray(input.windows) ? input.windows : [])
    .map(normalizeWindow)
    .filter((window): window is QuotaWindow => window !== null);

  return Object.freeze({
    provider: input.provider.trim(),
    plan: typeof input.plan === "string" && input.plan.trim() ? input.plan.trim() : null,
    windows: Object.freeze(windows),
    constrainingWindow: selectConstrainingQuotaWindow(windows),
  });
}

export function normalizeOpenClawQuotaSnapshot(
  value: unknown,
): OpenClawQuotaSnapshotResult {
  const input = record(value);
  if (!input || input.schemaVersion !== 1) {
    return { status: "unknown", reason: "invalid_snapshot" };
  }
  if (input.source !== "openclaw_usage_status") {
    return { status: "unknown", reason: "unsupported_source" };
  }
  if (input.freshness !== "fresh") {
    return { status: "unknown", reason: "stale_snapshot" };
  }

  const updatedAt = finiteNumber(input.updatedAt);
  const ageMs = finiteNumber(input.ageMs);
  if (updatedAt === null || ageMs === null || ageMs < 0) {
    return { status: "unknown", reason: "missing_timestamp" };
  }

  const providers = (Array.isArray(input.providers) ? input.providers : [])
    .map(normalizeProvider)
    .filter((provider): provider is ProviderQuotaSnapshot => provider !== null);

  return {
    status: "available",
    snapshot: Object.freeze({
      schemaVersion: 1,
      source: "openclaw_usage_status",
      updatedAt,
      ageMs,
      freshness: "fresh",
      providers: Object.freeze(providers),
    }),
  };
}

export type QuotaConsumptionWindowEvidence = Readonly<{
  label: string;
  consumedPercent: number;
  resetAt: number;
}>;

export type LoopQuotaConsumptionEvidence = Readonly<{
  schemaVersion: 1;
  source: "openclaw_usage_status_delta";
  provider: string;
  beforeUpdatedAt: number;
  afterUpdatedAt: number;
  windows: readonly QuotaConsumptionWindowEvidence[];
}>;

/**
 * Builds one measured quota-consumption fact from two fresh native snapshots.
 * A provider window is comparable only when both snapshots expose the same
 * reset boundary and usage is monotonic. A reset or backwards-moving usage
 * is discarded instead of being guessed across windows.
 */
export function deriveQuotaConsumptionEvidence(
  before: OpenClawQuotaSnapshot,
  after: OpenClawQuotaSnapshot,
  providerId: string,
): LoopQuotaConsumptionEvidence | null {
  if (!providerId.trim() || after.updatedAt <= before.updatedAt) return null;

  const beforeProvider = before.providers.find(
    (provider) => provider.provider === providerId,
  );
  const afterProvider = after.providers.find(
    (provider) => provider.provider === providerId,
  );
  if (!beforeProvider || !afterProvider) return null;

  const beforeByLabel = new Map(
    beforeProvider.windows.map((window) => [window.label, window] as const),
  );
  const windows = afterProvider.windows.flatMap((afterWindow) => {
    const beforeWindow = beforeByLabel.get(afterWindow.label);
    if (
      !beforeWindow ||
      beforeWindow.resetAt !== afterWindow.resetAt ||
      afterWindow.usedPercent < beforeWindow.usedPercent
    ) {
      return [];
    }

    return [
      Object.freeze({
        label: afterWindow.label,
        consumedPercent: afterWindow.usedPercent - beforeWindow.usedPercent,
        resetAt: afterWindow.resetAt,
      }),
    ];
  });

  if (windows.length === 0) return null;

  return Object.freeze({
    schemaVersion: 1,
    source: "openclaw_usage_status_delta",
    provider: providerId,
    beforeUpdatedAt: before.updatedAt,
    afterUpdatedAt: after.updatedAt,
    windows: Object.freeze(windows),
  });
}
