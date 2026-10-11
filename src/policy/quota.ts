import { DEFAULT_QUOTA_RESERVE } from "./defaults.js";
import type { QuotaReservePolicy } from "./types.js";


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

export type QuotaConsumptionWindowEvidence = Readonly<{
  label: string;
  consumedPercent: number;
  resetAt: number;
}>;

export type LoopQuotaConsumptionEvidence = Readonly<{
  schemaVersion: 1;
  // Historical Run History records still carry this source tag; the producer
  // (the retired OpenClaw runtime) no longer exists.
  source: "openclaw_usage_status_delta";
  provider: string;
  beforeUpdatedAt: number;
  afterUpdatedAt: number;
  windows: readonly QuotaConsumptionWindowEvidence[];
}>;
