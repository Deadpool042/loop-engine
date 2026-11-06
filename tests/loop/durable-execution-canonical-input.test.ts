import assert from "node:assert/strict";
import test from "node:test";

import {
  requestDurableExecutionCancellation,
  runDurableLoopExecution,
} from "../../src/loop/durable-execution-controller.js";
import type {
  DurableExecutionRecord,
  DurableExecutionRequest,
  DurableExecutionStore,
} from "../../src/loop/durable-execution.js";
import type { LoopRunResult } from "../../src/loop/types.js";

const NOW = () => "2026-11-06T10:00:00.000Z";

function completed(): LoopRunResult {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-1",
    project: "loop-engine",
    mode: "execute",
    status: "completed",
    startedAt: NOW(),
    completedAt: NOW(),
    candidate: null,
    steps: Object.freeze([]),
    validation: null,
    modifiedFiles: Object.freeze([]),
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
    providerFailoverEvidence: null,
    providerFailoverFingerprint: null,
  });
}

/** In-memory store that counts EVERY access, to prove refusals never reach it. */
function spyStore() {
  const records = new Map<string, DurableExecutionRecord>();
  const calls: string[] = [];
  const store: DurableExecutionStore = {
    async load(key) {
      calls.push(`load:${JSON.stringify(key)}`);
      return records.get(key) ?? null;
    },
    async save(record, expectedRevision) {
      calls.push(`save:${JSON.stringify(record.idempotencyKey)}`);
      const existing = records.get(record.idempotencyKey);
      if ((existing?.revision ?? null) !== expectedRevision) return false;
      records.set(record.idempotencyKey, record);
      return true;
    },
  };
  return { store, calls, records };
}

const base = {
  idempotencyKey: "cycle:e5:1",
  project: "loop-engine",
  owner: "loop-engine-cli:4242",
  leaseDurationMs: 60_000,
} as const satisfies DurableExecutionRequest;

async function run(
  store: DurableExecutionStore,
  overrides: Partial<Record<keyof DurableExecutionRequest, unknown>>,
) {
  let executed = 0;
  const outcome = await runDurableLoopExecution(
    store,
    { ...base, ...overrides } as DurableExecutionRequest,
    async () => {
      executed += 1;
      return completed();
    },
    NOW,
  );
  return { outcome, executed };
}

const NON_CANONICAL: ReadonlyArray<readonly [string, unknown]> = [
  ["empty", ""],
  ["leading space", " x"],
  ["trailing space", "x "],
  ["tab inside", "x\ty"],
  ["newline", "x\n"],
  ["NUL", "x\u0000y"],
  ["no-break space", "x\u00a0"],
  ["non-string", 7],
];

test("execute refuses every non-canonical field before any store access", async () => {
  for (const field of ["idempotencyKey", "owner"] as const) {
    for (const [label, value] of NON_CANONICAL) {
      const { store, calls } = spyStore();
      const { outcome, executed } = await run(store, { [field]: value });
      assert.equal(outcome.status, "rejected", `${field} ${label}`);
      assert.equal(
        outcome.status === "rejected" ? outcome.code : "",
        "invalid_request",
        `${field} ${label}`,
      );
      assert.deepEqual(calls, [], `${field} ${label}: store was touched`);
      assert.equal(executed, 0, `${field} ${label}: executor was called`);
    }
  }
  for (const value of [
    "",
    " loop-engine",
    "loop-engine ",
    "Loop-Engine",
    "a b",
    7,
  ]) {
    const { store, calls } = spyStore();
    const { outcome, executed } = await run(store, { project: value });
    assert.equal(outcome.status, "rejected", String(value));
    assert.deepEqual(calls, []);
    assert.equal(executed, 0);
  }
});

test("a key that differs only by surrounding whitespace is not an alias", async () => {
  const { store, records } = spyStore();
  const first = await run(store, { idempotencyKey: "k" });
  assert.equal(first.outcome.status, "executed");
  const second = await run(store, { idempotencyKey: "k " });
  assert.equal(second.outcome.status, "rejected");
  assert.deepEqual([...records.keys()], ["k"]);
  assert.ok(
    records.get("k")?.events.some((event) => event.owner === base.owner),
  );
});

test("canonical identifiers used in production are accepted unchanged", async () => {
  const key =
    "auto-subscription:creatyss:VNEXT4-S6A:1234567890123456789012345678901234567890";
  const { store, records } = spyStore();
  const { outcome } = await run(store, {
    idempotencyKey: key,
    project: "creatyss",
    owner: "loop-engine-cli:12345",
  });
  assert.equal(outcome.status, "executed");
  const record = records.get(key);
  assert.equal(record?.idempotencyKey, key);
  assert.equal(record?.project, "creatyss");
  assert.ok(
    record?.events.some((event) => event.owner === "loop-engine-cli:12345"),
  );
});

test("cancellation refuses non-canonical inputs before any store access", async () => {
  for (const [label, value] of NON_CANONICAL) {
    for (const args of [
      [value, "operator"],
      ["cycle:e5:1", value],
    ] as const) {
      const { store, calls } = spyStore();
      const result = await requestDurableExecutionCancellation(
        store,
        args[0] as string,
        args[1] as string,
        NOW,
      );
      assert.equal(result.status, "rejected", label);
      assert.equal(
        result.status === "rejected" ? result.code : "",
        "invalid_request",
      );
      assert.deepEqual(calls, [], `${label}: store was touched`);
    }
  }
});

test("cancellation addresses exactly the record that execute created", async () => {
  const { store } = spyStore();
  await run(store, { idempotencyKey: "cycle:e5:cancel" });
  const exact = await requestDurableExecutionCancellation(
    store,
    "cycle:e5:cancel",
    "operator",
    NOW,
  );
  assert.notEqual(
    exact.status === "rejected" ? exact.code : "",
    "invalid_request",
  );
  const padded = await requestDurableExecutionCancellation(
    store,
    "cycle:e5:cancel ",
    "operator",
    NOW,
  );
  assert.equal(
    padded.status === "rejected" ? padded.code : "",
    "invalid_request",
  );
});
