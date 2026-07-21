import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deliverLoopRuntimeEscalationProjection,
  serializeLoopRuntimeEscalationProjection,
  type LoopRuntimeEscalationProjectionSender,
  type LoopRuntimeEscalationPublicProjection,
} from "../../src/core/index.js";
import {
  createLoopRuntimeEscalationHttpSender,
  type LoopRuntimeEscalationHttpSenderOptions,
} from "../../src/transports/index.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function createProjection(): LoopRuntimeEscalationPublicProjection {
  const loopRunResult = deepFreeze({
    schemaVersion: 1,
    runId: "run-fixed",
    project: "fixture-project",
    mode: "execute",
    status: "failed",
    startedAt: "2026-07-21T00:00:00.000Z",
    completedAt: "2026-07-21T00:00:01.000Z",
    candidate: null,
    steps: [],
    validation: null,
    modifiedFiles: [],
    commit: null,
    publication: null,
    failure: {
      reason: "runtime failure",
    },
    agentPolicy: null,
    contextPackage: null,
  }) as unknown as LoopRunResult;

  return deepFreeze({
    schemaVersion: 1,
    loopRunResult,
    runtime: {
      outcome: "failed",
      runtimeStatus: "non_zero_exit",
      receipt: deepFreeze({
        schemaVersion: 1,
        receiptKind: "redacted",
        details: {
          accepted: false,
        },
      }),
    },
    escalation: {
      outcome: {
        outcome: "failed",
        runtimeStatus: "non_zero_exit",
      },
      failure: {
        kind: "process_failed",
        runtimeStatus: "non_zero_exit",
      },
      decision: {
        action: "escalate",
        reason: "failure_eligible",
        failureKind: "process_failed",
        runtimeStatus: "non_zero_exit",
      },
      selectedProfileId: "agent-profile-advanced",
    },
  }) as LoopRuntimeEscalationPublicProjection;
}

function createHttpSenderOptions(
  overrides: Partial<LoopRuntimeEscalationHttpSenderOptions> = {},
): LoopRuntimeEscalationHttpSenderOptions {
  return {
    url: "https://example.test/runtime-escalation?provider=secret-provider&model=secret-model",
    allowedUrls: [
      "https://example.test/runtime-escalation?provider=secret-provider&model=secret-model",
    ],
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-secret-header": "secret-header-value",
    },
    timeoutMs: 50,
    maxPayloadBytes: 4_096,
    fetchImpl: async () =>
      ({
        ok: true,
        status: 204,
      }) as Response,
    ...overrides,
  };
}

function assertNoForbiddenKeys(value: unknown, forbiddenKeys: ReadonlySet<string>): void {
  if (value === null || typeof value !== "object") {
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    assert.equal(forbiddenKeys.has(key), false, `forbidden key present: ${key}`);
    assertNoForbiddenKeys(nested, forbiddenKeys);
  }
}

describe("runtime escalation HTTP delivery integration", () => {
  it("delivers the serialized public projection end to end without exposing internal fields", async () => {
    const projection = createProjection();
    const payload = serializeLoopRuntimeEscalationProjection(projection);
    const callLog: Array<{
      input: RequestInfo | URL;
      init?: RequestInit;
    }> = [];

    const sender = createLoopRuntimeEscalationHttpSender(
      createHttpSenderOptions({
        fetchImpl: async (input, init) => {
          callLog.push({ input, init });
          return {
            ok: true,
            status: 204,
          } as Response;
        },
      }),
    );

    const before = structuredClone(projection);
    const result = await deliverLoopRuntimeEscalationProjection(projection, sender);

    assert.equal(result, undefined);
    assert.equal(callLog.length, 1);
    assert.equal(callLog[0].input, createHttpSenderOptions().url);
    assert.equal(callLog[0].init?.method, "POST");
    assert.equal(callLog[0].init?.redirect, "error");
    assert.deepEqual(callLog[0].init?.headers, createHttpSenderOptions().headers);
    assert.equal(callLog[0].init?.body, payload);
    assert.equal(callLog[0].init?.body, serializeLoopRuntimeEscalationProjection(projection));
    assert.match(callLog[0].init?.body as string, /^\{"schemaVersion":1,/);

    const body = callLog[0].init?.body as string;
    const parsed = JSON.parse(body) as LoopRuntimeEscalationPublicProjection;

    assert.deepEqual(parsed, projection);
    assert.deepEqual(projection, before);
    assert.ok(Object.isFrozen(projection));
    assert.ok(Object.isFrozen(projection.loopRunResult));
    assert.ok(Object.isFrozen(projection.runtime));
    assert.ok(Object.isFrozen(projection.runtime.receipt));
    assert.ok(Object.isFrozen(projection.escalation));

    const forbiddenKeys = new Set([
      "runtimeResult",
      "resolution",
      "diagnostics",
      "agentRequest",
      "registry",
      "request",
      "failureReason",
      "profile",
      "rejected",
      "budget",
      "capabilities",
      "permissions",
      "provider",
      "model",
      "effort",
      "stdout",
      "stderr",
      "output",
    ]);
    assertNoForbiddenKeys(parsed, forbiddenKeys);

    for (const secret of [
      "secret-header-value",
      "secret-runtime-output",
      "secret-provider",
      "secret-model",
    ]) {
      assert.doesNotMatch(body, new RegExp(secret));
    }
  });

  it("redacts sender failures end to end and never retries", async () => {
    const projection = createProjection();
    const destination = createHttpSenderOptions();
    let callCount = 0;
    const failure = new Error(
      `network failure for ${destination.url} with secret-header-value and secret-runtime-output`,
    );

    const sender: LoopRuntimeEscalationProjectionSender =
      createLoopRuntimeEscalationHttpSender({
        ...destination,
        fetchImpl: async () => {
          callCount += 1;
          throw failure;
        },
      });

    await assert.rejects(
      deliverLoopRuntimeEscalationProjection(projection, sender),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "HTTP sender request failed");
        assert.doesNotMatch(error.message, /secret-header-value|secret-runtime-output|secret-provider|secret-model|https?:\/\//i);
        return true;
      },
    );

    assert.equal(callCount, 1);
    assert.deepEqual(projection, createProjection());
  });
});
