import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  createDurableExecutionControlPlane,
  createOrchestrationGateway,
} from "../../src/composition/index.js";
import { createFileDurableExecutionStore } from "../../src/loop/file-durable-execution-store.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function completedResult(runId: string): LoopRunResult {
  return Object.freeze({
    schemaVersion: 1,
    runId,
    project: "loop-engine",
    mode: "execute",
    status: "completed",
    startedAt: "2026-07-31T04:00:00.000Z",
    completedAt: "2026-07-31T04:00:01.000Z",
    candidate: null,
    steps: Object.freeze([]),
    validation: null,
    modifiedFiles: Object.freeze(["src/result.ts"]),
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
    providerFailoverEvidence: null,
    providerFailoverFingerprint: null,
  });
}

function executeRequest(idempotencyKey: string, owner = "n8n-worker-1") {
  return Object.freeze({
    schemaVersion: 1 as const,
    operation: "execute" as const,
    request: Object.freeze({
      idempotencyKey,
      project: "loop-engine",
      owner,
      leaseDurationMs: 60_000,
    }),
  });
}

async function withDirectory(
  callback: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "loop-gateway-"));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("production gateway persists and replays execution across process restart", async () => {
  await withDirectory(async (directory) => {
    let calls = 0;
    const firstRepository = createFileDurableExecutionStore({ directory });
    const firstControl = createDurableExecutionControlPlane(firstRepository, {
      now: () => "2026-07-31T04:00:00.000Z",
      runLoopExecute: async () => {
        calls += 1;
        return completedResult(`run-${calls}`);
      },
    });
    const firstGateway = createOrchestrationGateway(
      firstRepository,
      firstControl,
    );

    const executed = await firstGateway.handle(executeRequest("cycle:v15.1:1"));
    assert.equal(executed.status, "ok");
    assert.equal(executed.code, "executed");
    assert.equal(executed.record?.status, "completed");
    assert.equal(executed.fingerprint?.algorithm, "sha256");

    const restartedRepository = createFileDurableExecutionStore({ directory });
    const restartedControl = createDurableExecutionControlPlane(
      restartedRepository,
      {
        now: () => "2026-07-31T04:10:00.000Z",
        runLoopExecute: async () => {
          calls += 1;
          return completedResult(`run-${calls}`);
        },
      },
    );
    const restartedGateway = createOrchestrationGateway(
      restartedRepository,
      restartedControl,
    );

    const replayed = await restartedGateway.handle(
      executeRequest("cycle:v15.1:1", "n8n-worker-2"),
    );
    assert.equal(replayed.code, "replayed");
    assert.equal(replayed.record?.result?.runId, "run-1");
    assert.equal(calls, 1);

    const status = await restartedGateway.handle({
      schemaVersion: 1,
      operation: "status",
      idempotencyKey: "cycle:v15.1:1",
    });
    assert.equal(status.code, "completed");

    const listed = await restartedGateway.handle({
      schemaVersion: 1,
      operation: "list",
      project: "loop-engine",
    });
    assert.equal(listed.records?.length, 1);
    assert.equal(listed.records?.[0]?.attempt, 1);

    const verified = await restartedGateway.handle({
      schemaVersion: 1,
      operation: "verify",
      idempotencyKey: "cycle:v15.1:1",
    });
    assert.equal(verified.code, "integrity_verified");
  });
});

test("file repository enforces compare-and-swap after restart", async () => {
  await withDirectory(async (directory) => {
    const repository = createFileDurableExecutionStore({ directory });
    const control = createDurableExecutionControlPlane(repository, {
      now: () => "2026-07-31T04:00:00.000Z",
      runLoopExecute: async () => completedResult("run-cas"),
    });
    const gateway = createOrchestrationGateway(repository, control);
    await gateway.handle(executeRequest("cycle:cas:1"));

    const record = await repository.load("cycle:cas:1");
    assert.ok(record);
    const drifted = Object.freeze({
      ...record,
      revision: record.revision + 1,
      updatedAt: "2026-07-31T04:20:00.000Z",
    });
    assert.equal(await repository.save(drifted, record.revision - 1), false);
    assert.equal(await repository.save(drifted, record.revision), true);
  });
});

test("gateway detects persistent record corruption", async () => {
  await withDirectory(async (directory) => {
    const repository = createFileDurableExecutionStore({ directory });
    const control = createDurableExecutionControlPlane(repository, {
      now: () => "2026-07-31T04:00:00.000Z",
      runLoopExecute: async () => completedResult("run-integrity"),
    });
    const gateway = createOrchestrationGateway(repository, control);
    await gateway.handle(executeRequest("cycle:integrity:1"));

    const digest = createHash("sha256")
      .update("cycle:integrity:1", "utf8")
      .digest("hex");
    const path = join(directory, `${digest}.json`);
    const envelope = JSON.parse(await readFile(path, "utf8")) as {
      record: { attempt: number };
    };
    envelope.record.attempt = 99;
    await writeFile(path, JSON.stringify(envelope), "utf8");

    const verified = await gateway.handle({
      schemaVersion: 1,
      operation: "verify",
      idempotencyKey: "cycle:integrity:1",
    });
    assert.equal(verified.status, "rejected");
    assert.equal(verified.code, "integrity_failed");
  });
});

test("serialized gateway rejects malformed JSON without leaking parser details", async () => {
  await withDirectory(async (directory) => {
    const repository = createFileDurableExecutionStore({ directory });
    const control = createDurableExecutionControlPlane(repository, {
      runLoopExecute: async () => completedResult("unused"),
    });
    const gateway = createOrchestrationGateway(repository, control);
    const response = JSON.parse(await gateway.handleSerialized("{")) as {
      status: string;
      code: string;
    };
    assert.equal(response.status, "rejected");
    assert.equal(response.code, "invalid_json");
  });
});
