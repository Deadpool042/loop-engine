import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createDurableExecutionControlPlane,
  createOrchestrationGateway,
} from "../../src/composition/index.js";
import { createFileDurableExecutionStore } from "../../src/loop/file-durable-execution-store.js";
import type { DurableExecutionRepository } from "../../src/loop/durable-execution.js";
import type { LoopRunResult } from "../../src/loop/types.js";

const NOW = "2026-11-06T10:00:00.000Z";

function completed(): LoopRunResult {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-1",
    project: "loop-engine",
    mode: "execute",
    status: "completed",
    startedAt: NOW,
    completedAt: NOW,
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

/** Repository + control plane that fail the test on ANY access. */
function untouchable() {
  const touched: string[] = [];
  const trap = (name: string) => async () => {
    touched.push(name);
    throw new Error(`unexpected access: ${name}`);
  };
  const repository = {
    load: trap("load"),
    save: trap("save"),
    list: trap("list"),
    verify: trap("verify"),
  } as unknown as DurableExecutionRepository;
  const controlPlane = {
    execute: trap("execute"),
    cancel: trap("cancel"),
  } as never;
  return {
    gateway: createOrchestrationGateway(repository, controlPlane),
    touched,
  };
}

const BAD = ["", " k", "k ", "k\n", "k\tk", "k\u0000", "k ", 5, null];

const exec = (request: Record<string, unknown>) => ({
  schemaVersion: 1,
  operation: "execute",
  request: {
    idempotencyKey: "cycle:e5:1",
    project: "loop-engine",
    owner: "loop-engine-cli:1",
    leaseDurationMs: 60_000,
    ...request,
  },
});

test("every operation refuses non-canonical identifiers without touching the store", async () => {
  const { gateway, touched } = untouchable();
  const requests: unknown[] = [];
  for (const value of BAD) {
    requests.push(
      exec({ idempotencyKey: value }),
      exec({ owner: value }),
      exec({ project: value }),
      { schemaVersion: 1, operation: "status", idempotencyKey: value },
      { schemaVersion: 1, operation: "verify", idempotencyKey: value },
      {
        schemaVersion: 1,
        operation: "cancel",
        idempotencyKey: value,
        requestedBy: "operator",
      },
      {
        schemaVersion: 1,
        operation: "cancel",
        idempotencyKey: "cycle:e5:1",
        requestedBy: value,
      },
    );
    if (value !== "") {
      // an empty project filter was already rejected; keep it covered too
      requests.push({ schemaVersion: 1, operation: "list", project: value });
    }
  }
  requests.push({
    schemaVersion: 1,
    operation: "list",
    project: "Not-Canonical",
  });
  for (const request of requests) {
    const result = await gateway.handle(request);
    assert.equal(result.status, "rejected", JSON.stringify(request));
    assert.equal(result.code, "invalid_request", JSON.stringify(request));
  }
  assert.deepEqual(touched, []);
});

test("status of a padded key is invalid_request, not not_found", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loop-e5-gateway-"));
  try {
    const repository = createFileDurableExecutionStore({ directory });
    const control = createDurableExecutionControlPlane(repository, {
      now: () => NOW,
      runLoopExecute: async () => completed(),
    });
    const gateway = createOrchestrationGateway(repository, control);

    assert.equal((await gateway.handle(exec({}))).code, "executed");
    const files = await readdir(directory);

    for (const operation of ["status", "verify"] as const) {
      const exact = await gateway.handle({
        schemaVersion: 1,
        operation,
        idempotencyKey: "cycle:e5:1",
      });
      assert.equal(exact.status, "ok", operation);
      const padded = await gateway.handle({
        schemaVersion: 1,
        operation,
        idempotencyKey: "cycle:e5:1 ",
      });
      assert.equal(padded.code, "invalid_request", operation);
    }
    const listed = await gateway.handle({
      schemaVersion: 1,
      operation: "list",
      project: "loop-engine",
    });
    assert.equal(listed.records?.length, 1);

    // refused executions never created or altered any stored file
    assert.equal(
      (await gateway.handle(exec({ idempotencyKey: "cycle:e5:1 " }))).code,
      "invalid_request",
    );
    assert.deepEqual(await readdir(directory), files);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
