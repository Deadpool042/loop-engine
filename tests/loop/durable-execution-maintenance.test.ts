import assert from "node:assert/strict";
import test from "node:test";

import {
  DURABLE_EXECUTION_SCHEMA_VERSION,
  inspectDurableExecutions,
  runDurableExecutionMaintenance,
  type DurableExecutionRecord,
} from "../../src/core/index.js";

function record(
  idempotencyKey: string,
  overrides: Partial<DurableExecutionRecord> = {},
): DurableExecutionRecord {
  return Object.freeze({
    schemaVersion: DURABLE_EXECUTION_SCHEMA_VERSION,
    revision: 1,
    idempotencyKey,
    project: "project-a",
    status: "running",
    attempt: 1,
    leaseOwner: "worker-a",
    leaseExpiresAt: "2026-07-31T09:00:00.000Z",
    cancellationRequested: false,
    createdAt: "2026-07-31T08:00:00.000Z",
    updatedAt: "2026-07-31T08:00:00.000Z",
    result: null,
    failure: null,
    events: Object.freeze([]),
    ...overrides,
  });
}

test("classifies and sorts mixed durable executions", async () => {
  const inventory = {
    async list() {
      return [
        record("z-terminal", {
          status: "completed",
          leaseOwner: null,
          leaseExpiresAt: null,
        }),
        record("a-recoverable", {
          leaseExpiresAt: "2026-07-31T08:00:00.000Z",
        }),
        record("m-active"),
      ];
    },
  };

  const report = await inspectDurableExecutions(
    inventory,
    () => "2026-07-31T08:30:00.000Z",
  );

  assert.equal(report.total, 3);
  assert.equal(report.active, 1);
  assert.equal(report.recoverable, 1);
  assert.equal(report.terminal, 1);
  assert.deepEqual(
    report.entries.map((entry) => [entry.idempotencyKey, entry.status]),
    [
      ["a-recoverable", "recoverable"],
      ["m-active", "active"],
      ["z-terminal", "terminal"],
    ],
  );
});

test("rejects an invalid observation timestamp", async () => {
  await assert.rejects(
    inspectDurableExecutions(
      { async list() { return []; } },
      () => "invalid",
    ),
    /valid timestamp/,
  );
});

test("applies maintenance only to non-active entries and isolates failures", async () => {
  const inventory = {
    async list() {
      return [
        record("active"),
        record("recoverable", {
          leaseExpiresAt: "2026-07-31T08:00:00.000Z",
        }),
        record("terminal", {
          status: "failed",
          leaseOwner: null,
          leaseExpiresAt: null,
        }),
      ];
    },
  };
  const visited: string[] = [];

  const result = await runDurableExecutionMaintenance(
    inventory,
    {
      async apply(entry) {
        visited.push(entry.idempotencyKey);
        if (entry.idempotencyKey === "terminal") throw new Error("failed");
      },
    },
    () => "2026-07-31T08:30:00.000Z",
  );

  assert.deepEqual(visited, ["recoverable", "terminal"]);
  assert.deepEqual(result.applied, ["recoverable"]);
  assert.deepEqual(result.failed, ["terminal"]);
});
