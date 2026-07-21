import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_ESCALATION_PUBLIC_SCHEMA_VERSION,
  serializeLoopRuntimeEscalationProjection,
  type ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationResult,
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
    schemaVersion: LOOP_RUNTIME_ESCALATION_PUBLIC_SCHEMA_VERSION,
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

function assertForbiddenKeys(value: unknown, path = "root"): void {
  if (value === null || typeof value !== "object") {
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    assert.doesNotMatch(
      key,
      /^(runtimeResult|resolution|diagnostics|agentRequest|registry|request|failureReason|profile|rejected|budget|capabilities|permissions|provider|model|effort|stdout|stderr|output)$/,
      `forbidden key at ${path}.${key}`,
    );
    assertForbiddenKeys(nested, `${path}.${key}`);
  }
}

describe("serializeLoopRuntimeEscalationProjection", () => {
  it("serializes a complete public projection as compact JSON with schemaVersion first", () => {
    const projection = createProjection();
    const before = structuredClone(projection);

    const serialized = serializeLoopRuntimeEscalationProjection(projection);
    const serializedAgain = serializeLoopRuntimeEscalationProjection(projection);

    assert.equal(serialized, serializedAgain);
    assert.equal(serialized, JSON.stringify(projection));
    assert.equal(serialized.startsWith('{"schemaVersion":1,'), true);
    assert.equal(serialized.includes("\n"), false);
    assert.equal(serialized.includes("  "), false);
    assert.deepEqual(JSON.parse(serialized), projection);
    assert.deepEqual(projection, before);
    assert.ok(Object.isFrozen(projection));
    assert.ok(Object.isFrozen(projection.loopRunResult));
    assert.ok(Object.isFrozen(projection.runtime));
    assert.ok(Object.isFrozen(projection.runtime.receipt));
    assert.ok(Object.isFrozen(projection.escalation));
    assertForbiddenKeys(JSON.parse(serialized));
  });

  it("accepts only the public projection type and rejects the internal V13.38 result at compile time", () => {
    if (false) {
      const internalExecutionResult =
        {} as ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationResult;

      // @ts-expect-error Le sérialiseur accepte uniquement la projection publique.
      serializeLoopRuntimeEscalationProjection(internalExecutionResult);
    }

    const projection = createProjection();
    assert.equal(
      serializeLoopRuntimeEscalationProjection(projection),
      JSON.stringify(projection),
    );
  });
});
