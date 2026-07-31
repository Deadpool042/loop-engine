import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createDurableExecutionEnvelope,
  decodeDurableExecutionEnvelope,
  parseDurableExecutionEnvelope,
} from "../../src/loop/durable-execution-envelope.js";
import type { DurableExecutionRecord } from "../../src/loop/durable-execution.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function result(): LoopRunResult {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-envelope",
    project: "loop-engine",
    mode: "execute",
    status: "completed",
    startedAt: "2026-07-31T04:00:00.000Z",
    completedAt: "2026-07-31T04:00:01.000Z",
    candidate: null,
    steps: Object.freeze([]),
    validation: null,
    modifiedFiles: Object.freeze([]),
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
  });
}

function record(): DurableExecutionRecord {
  return Object.freeze({
    schemaVersion: 1,
    revision: 2,
    idempotencyKey: "cycle:envelope:1",
    project: "loop-engine",
    status: "completed",
    attempt: 1,
    leaseOwner: null,
    leaseExpiresAt: null,
    cancellationRequested: false,
    createdAt: "2026-07-31T04:00:00.000Z",
    updatedAt: "2026-07-31T04:00:01.000Z",
    result: result(),
    failure: null,
    events: Object.freeze([
      Object.freeze({
        sequence: 1,
        at: "2026-07-31T04:00:00.000Z",
        type: "lease_acquired" as const,
        owner: "worker-1",
      }),
      Object.freeze({
        sequence: 2,
        at: "2026-07-31T04:00:01.000Z",
        type: "completed" as const,
        owner: "worker-1",
      }),
    ]),
  });
}

test("durable envelope accepts a canonical record and fingerprint", () => {
  const envelope = createDurableExecutionEnvelope(record());
  const decoded = decodeDurableExecutionEnvelope(envelope);
  assert.equal(decoded.status, "accepted");
  if (decoded.status === "accepted") {
    assert.equal(decoded.envelope.record.idempotencyKey, "cycle:envelope:1");
    assert.equal(decoded.envelope.fingerprint.algorithm, "sha256");
  }
});

test("durable envelope rejects fingerprint drift", () => {
  const envelope = createDurableExecutionEnvelope(record());
  const drifted = {
    ...envelope,
    record: { ...envelope.record, attempt: 2 },
  };
  const decoded = decodeDurableExecutionEnvelope(drifted);
  assert.equal(decoded.status, "rejected");
  if (decoded.status === "rejected") {
    assert.equal(decoded.code, "fingerprint_mismatch");
  }
});

test("durable envelope rejects impossible event ordering", () => {
  const envelope = createDurableExecutionEnvelope(record());
  const impossible = {
    ...envelope,
    record: {
      ...envelope.record,
      events: envelope.record.events.map((item) => ({
        ...item,
        sequence: item.sequence + 1,
      })),
    },
  };
  const decoded = decodeDurableExecutionEnvelope(impossible);
  assert.equal(decoded.status, "rejected");
  if (decoded.status === "rejected") {
    assert.equal(decoded.code, "invalid_record");
  }
});

test("serialized envelope rejects malformed and empty JSON", () => {
  assert.equal(parseDurableExecutionEnvelope("").status, "rejected");
  assert.equal(parseDurableExecutionEnvelope("{").status, "rejected");
});
