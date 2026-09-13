import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyQuotaReserve,
  deriveQuotaConsumptionEvidence,
  evaluateQuotaReservePolicy,
  normalizeOpenClawQuotaSnapshot,
  selectConstrainingQuotaWindow,
  type QuotaWindow,
} from "../../src/policy/quota.js";

describe("OpenClaw quota snapshot normalization", () => {
  it("keeps every valid window with reset and selects the lowest remaining quota", () => {
    const result = normalizeOpenClawQuotaSnapshot({
      schemaVersion: 1,
      source: "openclaw_usage_status",
      freshness: "fresh",
      updatedAt: 1_000,
      ageMs: 500,
      providers: [
        {
          provider: "openai",
          plan: "plus",
          windows: [
            { label: "5h", usedPercent: 20, resetAt: 2_000 },
            { label: "Week", usedPercent: 65, resetAt: 8_000 },
          ],
        },
      ],
    });

    assert.equal(result.status, "available");
    if (result.status !== "available") return;

    const provider = result.snapshot.providers[0]!;
    assert.deepEqual(
      provider.windows.map((window) => ({
        label: window.label,
        remainingPercent: window.remainingPercent,
        resetAt: window.resetAt,
      })),
      [
        { label: "5h", remainingPercent: 80, resetAt: 2_000 },
        { label: "Week", remainingPercent: 35, resetAt: 8_000 },
      ],
    );
    assert.equal(provider.constrainingWindow?.label, "Week");
  });

  it("uses the later reset as deterministic tie-break when remaining quota is equal", () => {
    const windows: readonly QuotaWindow[] = [
      { label: "5h", usedPercent: 50, remainingPercent: 50, resetAt: 2_000 },
      { label: "Week", usedPercent: 50, remainingPercent: 50, resetAt: 8_000 },
    ];

    assert.equal(selectConstrainingQuotaWindow(windows)?.label, "Week");
  });

  it("fails closed when the native snapshot is stale", () => {
    assert.deepEqual(
      normalizeOpenClawQuotaSnapshot({
        schemaVersion: 1,
        source: "openclaw_usage_status",
        freshness: "unknown_or_stale",
        updatedAt: 1_000,
        ageMs: 600_000,
        providers: [],
      }),
      { status: "unknown", reason: "stale_snapshot" },
    );
  });

  it("does not invent windows when a provider exposes none", () => {
    const result = normalizeOpenClawQuotaSnapshot({
      schemaVersion: 1,
      source: "openclaw_usage_status",
      freshness: "fresh",
      updatedAt: 1_000,
      ageMs: 20,
      providers: [{ provider: "anthropic", plan: null, windows: [] }],
    });

    assert.equal(result.status, "available");
    if (result.status !== "available") return;
    assert.equal(result.snapshot.providers[0]?.constrainingWindow, null);
    assert.deepEqual(result.snapshot.providers[0]?.windows, []);
  });
});

describe("quota consumption evidence", () => {
  it("derives measured deltas only across the same native reset window", () => {
    const before = normalizeOpenClawQuotaSnapshot({
      schemaVersion: 1,
      source: "openclaw_usage_status",
      freshness: "fresh",
      updatedAt: 1_000,
      ageMs: 10,
      providers: [
        {
          provider: "openai",
          plan: "plus",
          windows: [
            { label: "5h", usedPercent: 12, resetAt: 5_000 },
            { label: "Week", usedPercent: 5, resetAt: 9_000 },
          ],
        },
      ],
    });
    const after = normalizeOpenClawQuotaSnapshot({
      schemaVersion: 1,
      source: "openclaw_usage_status",
      freshness: "fresh",
      updatedAt: 2_000,
      ageMs: 10,
      providers: [
        {
          provider: "openai",
          plan: "plus",
          windows: [
            { label: "5h", usedPercent: 15, resetAt: 5_000 },
            { label: "Week", usedPercent: 7, resetAt: 9_000 },
          ],
        },
      ],
    });

    assert.equal(before.status, "available");
    assert.equal(after.status, "available");
    if (before.status !== "available" || after.status !== "available") return;

    assert.deepEqual(
      deriveQuotaConsumptionEvidence(before.snapshot, after.snapshot, "openai"),
      {
        schemaVersion: 1,
        source: "openclaw_usage_status_delta",
        provider: "openai",
        beforeUpdatedAt: 1_000,
        afterUpdatedAt: 2_000,
        windows: [
          { label: "5h", consumedPercent: 3, resetAt: 5_000 },
          { label: "Week", consumedPercent: 2, resetAt: 9_000 },
        ],
      },
    );
  });

  it("refuses to infer consumption across a reset boundary", () => {
    const before = normalizeOpenClawQuotaSnapshot({
      schemaVersion: 1,
      source: "openclaw_usage_status",
      freshness: "fresh",
      updatedAt: 1_000,
      ageMs: 10,
      providers: [
        {
          provider: "openai",
          plan: "plus",
          windows: [{ label: "5h", usedPercent: 80, resetAt: 5_000 }],
        },
      ],
    });
    const after = normalizeOpenClawQuotaSnapshot({
      schemaVersion: 1,
      source: "openclaw_usage_status",
      freshness: "fresh",
      updatedAt: 2_000,
      ageMs: 10,
      providers: [
        {
          provider: "openai",
          plan: "plus",
          windows: [{ label: "5h", usedPercent: 1, resetAt: 10_000 }],
        },
      ],
    });

    assert.equal(before.status, "available");
    assert.equal(after.status, "available");
    if (before.status !== "available" || after.status !== "available") return;

    assert.equal(
      deriveQuotaConsumptionEvidence(before.snapshot, after.snapshot, "openai"),
      null,
    );
  });
});

describe("quota reserve policy", () => {
  it("uses the default 10/5/5 reserve and exposes 20 percent total", () => {
    assert.deepEqual(evaluateQuotaReservePolicy(), {
      repairPercent: 10,
      ciPercent: 5,
      emergencyPercent: 5,
      totalPercent: 20,
    });
  });

  it("accepts a custom reserve without mutating native remaining quota", () => {
    assert.deepEqual(
      applyQuotaReserve(42, {
        repairPercent: 8,
        ciPercent: 4,
        emergencyPercent: 3,
      }),
      {
        remainingPercent: 42,
        reserve: {
          repairPercent: 8,
          ciPercent: 4,
          emergencyPercent: 3,
          totalPercent: 15,
        },
        usablePercent: 27,
        reserveBinding: true,
      },
    );
  });

  it("never exposes negative usable quota when the reserve exceeds remaining capacity", () => {
    assert.equal(applyQuotaReserve(12).usablePercent, 0);
  });

  it("fails closed when a reserve component or total is invalid", () => {
    assert.throws(
      () =>
        evaluateQuotaReservePolicy({
          repairPercent: -1,
          ciPercent: 5,
          emergencyPercent: 5,
        }),
      /Invalid quota reserve percentage/,
    );
    assert.throws(
      () =>
        evaluateQuotaReservePolicy({
          repairPercent: 60,
          ciPercent: 30,
          emergencyPercent: 20,
        }),
      /exceeds 100 percent/,
    );
  });
});
