import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deliverLoopRuntimeEscalationProjection,
  projectLoopRuntimeEscalationResult,
  serializeLoopRuntimeEscalationProjection,
  type ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationResult,
  type LoopRuntimeEscalationProjectionSender,
  type LoopRuntimeEscalationPublicProjection,
} from "../../src/core/index.js";
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
    status: "completed",
    startedAt: "2026-07-21T00:00:00.000Z",
    completedAt: "2026-07-21T00:00:01.000Z",
    candidate: null,
    steps: [],
    validation: null,
    modifiedFiles: [],
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
  }) as unknown as LoopRunResult;

  return deepFreeze({
    schemaVersion: 1,
    loopRunResult,
    runtime: {
      outcome: "executed",
      runtimeStatus: "completed",
      receipt: deepFreeze({
        schemaVersion: 1,
        receiptKind: "redacted",
        details: {
          accepted: true,
        },
      }),
    },
    escalation: {
      outcome: {
        outcome: "succeeded",
        runtimeStatus: "completed",
      },
      failure: {
        kind: null,
        runtimeStatus: "completed",
      },
      decision: {
        action: "none",
        reason: "no_failure",
        failureKind: null,
        runtimeStatus: "completed",
      },
      selectedProfileId: null,
    },
  }) as LoopRuntimeEscalationPublicProjection;
}

describe("deliverLoopRuntimeEscalationProjection", () => {
  it("serializes once, delivers once, and returns void on success", async () => {
    const projection = createProjection();
    const payload = serializeLoopRuntimeEscalationProjection(projection);
    const calls: string[] = [];

    const sender: LoopRuntimeEscalationProjectionSender = {
      async send(nextPayload: string) {
        calls.push(nextPayload);
      },
    };

    const before = structuredClone(projection);
    const result = await deliverLoopRuntimeEscalationProjection(
      projection,
      sender,
    );

    assert.equal(result, undefined);
    assert.deepEqual(calls, [payload]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0], JSON.stringify(projection));
    assert.equal(calls[0].startsWith('{"schemaVersion":1,'), true);
    assert.deepEqual(projection, before);
    assert.ok(Object.isFrozen(projection));
    assert.ok(Object.isFrozen(projection.loopRunResult));
    assert.ok(Object.isFrozen(projection.runtime));
    assert.ok(Object.isFrozen(projection.runtime.receipt));
    assert.ok(Object.isFrozen(projection.escalation));
  });

  it("propagates sender rejection without retrying", async () => {
    const projection = createProjection();
    let callCount = 0;
    const failure = new Error("sender rejected");

    const sender: LoopRuntimeEscalationProjectionSender = {
      async send() {
        callCount += 1;
        throw failure;
      },
    };

    await assert.rejects(
      deliverLoopRuntimeEscalationProjection(projection, sender),
      (error: unknown) => error === failure,
    );
    assert.equal(callCount, 1);
    assert.deepEqual(projection, createProjection());
  });

  it("accepts only the public projection and rejects the internal result at compile time", () => {
    if (false) {
      const internalExecutionResult =
        {} as ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationResult;
      const sender = {
        send: async (_payload: string) => {},
      } satisfies LoopRuntimeEscalationProjectionSender;

      // @ts-expect-error Le livreur accepte uniquement la projection publique.
      deliverLoopRuntimeEscalationProjection(internalExecutionResult, sender);

      // Keep the internal result bridge type alive in the same file.
      void projectLoopRuntimeEscalationResult;
    }

    const projection = createProjection();
    assert.equal(
      deliverLoopRuntimeEscalationProjection(
        projection,
        {
          async send() {},
        },
      ) instanceof Promise,
      true,
    );
  });
});
