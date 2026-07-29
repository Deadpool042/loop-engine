import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
  executePreparedInboundRuntimeRequest,
  type InboundLoopRuntimeRequestEnvelope,
  type LoopRuntimeAuthorizedEngineAssembly,
  type PreparedInboundRuntimeExecutionContext,
  type PreparedInboundRuntimeExecutionDependencies,
} from "../../src/core/index.js";
import type { AgentProfile } from "../../src/agents/types.js";
import type { MinimalContextPackage } from "../../src/context/types.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { AgentPolicyResolution } from "../../src/policy/types.js";
import type {
  RuntimeAdapter,
  RuntimeRequest,
  RuntimeResult,
} from "../../src/runtime/index.js";
import type {
  InboundAccessPolicy,
  InboundAccessRequest,
  InboundAuthenticationEvidence,
  InboundAuthenticationInput,
  InboundPrincipal,
  InboundReplayEvidence,
} from "../../src/inbound-security/index.js";

const EVALUATED_AT = "2026-07-29T18:00:00.000Z";
const REQUEST_ID = "request-v14-3";

const AUTH_INPUT: InboundAuthenticationInput = Object.freeze({
  method: "opaque",
  credential: "raw-secret-never-forward",
  issuerHint: "issuer-1",
  subjectHint: "principal-1",
});

function payload(mode: "execute" | "dry-run" = "execute") {
  return {
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: "loop-engine",
    cycleId: "cycle-v14-3",
    mode,
    policyRef: "policy.ref",
    profileRef: "profile.ref",
    requestedMaxEffort: "medium",
    budget: {
      maxTokens: 10,
      maxCostUsd: 1,
      maxDurationMs: 1_000,
      maxCalls: 1,
      maxRepairs: 0,
    },
  };
}

function assembly(
  runtimeId: string = "custom",
): LoopRuntimeAuthorizedEngineAssembly {
  return {
    catalog: {
      policies: [
        {
          ref: "policy.ref",
          value: { policyRef: "policy.ref", policyId: "policy-id" },
        },
      ],
      profiles: [
        {
          ref: "profile.ref",
          value: {
            profileRef: "profile.ref",
            profileId: "profile-id",
            maxEffort: "medium",
          },
        },
      ],
    },
    limits: {
      maxEffort: "medium",
      budget: {
        maxTokens: 10,
        maxCostUsd: 1,
        maxDurationMs: 1_000,
        maxCalls: 1,
        maxRepairs: 0,
      },
    },
    binding: {
      runtimeId,
      executable: "/usr/bin/node",
      arguments: ["--version"],
      cwd: "/workspace/loop-engine",
    },
  };
}

function evidence(): InboundAuthenticationEvidence {
  return Object.freeze({
    evidenceId: "evidence-1",
    method: "opaque",
    subjectId: "principal-1",
    issuerId: "issuer-1",
    credentialFingerprint: "fp-1",
    verified: true,
    issuedAt: "2026-07-29T17:00:00.000Z",
    validFrom: "2026-07-29T17:00:00.000Z",
    expiresAt: "2026-07-29T19:00:00.000Z",
  });
}

function principal(): InboundPrincipal {
  return Object.freeze({
    principalId: "principal-1",
    principalType: "user",
    tenantId: "tenant-1",
    roles: Object.freeze(["operator"]),
  });
}

function accessRequest(
  operation: "execute" | "dry-run" = "execute",
): InboundAccessRequest {
  return Object.freeze({
    requestId: REQUEST_ID,
    principalId: "principal-1",
    tenantId: "tenant-1",
    project: "loop-engine",
    operation,
  });
}

function replayEvidence(): InboundReplayEvidence {
  return Object.freeze({
    requestId: REQUEST_ID,
    evidenceId: "evidence-1",
    receivedAt: EVALUATED_AT,
    nonce: "nonce-v14-3",
    replayed: false,
  });
}

function inboundPolicy(): InboundAccessPolicy {
  return Object.freeze({
    allowedOperations: Object.freeze(["execute", "dry-run"]),
    replayCheckRequired: true,
  });
}

function envelope(
  mode: "execute" | "dry-run" = "execute",
): InboundLoopRuntimeRequestEnvelope {
  return Object.freeze({
    requestId: REQUEST_ID,
    authenticationInput: AUTH_INPUT,
    verificationContext: Object.freeze({
      requestId: REQUEST_ID,
      evaluatedAt: EVALUATED_AT,
    }),
    principal: principal(),
    accessRequest: accessRequest(mode),
    replayEvidence: replayEvidence(),
    policy: inboundPolicy(),
    evaluatedAt: EVALUATED_AT,
    payload: payload(mode),
  });
}

function profile(runtime: AgentProfile["runtime"] = "custom"): AgentProfile {
  return Object.freeze({
    id: "profile-id",
    runtime,
    provider: "local",
    model: "simulated",
    effort: "medium",
    capabilities: Object.freeze(["code_edit"]),
    permissions: Object.freeze(["read_only", "write_worktree", "shell_exec"]),
    budget: Object.freeze({
      maxTokens: 10,
      maxCostUsd: 1,
      maxDurationMs: 1_000,
      maxCalls: 1,
      maxRepairs: 0,
    }),
  });
}

function policy(
  allowedRuntimes: AgentPolicyResolution["requirements"]["allowedRuntimes"] = [
    "custom",
  ],
): AgentPolicyResolution {
  const selectedProfile = profile();
  return Object.freeze({
    policyId: "policy-id",
    mode: "execute",
    status: "resolved",
    requirements: Object.freeze({
      category: "code",
      mode: "execute",
      requiredCapabilities: Object.freeze(["code_edit"]),
      requiredPermissions: Object.freeze([
        "read_only",
        "write_worktree",
        "shell_exec",
      ]),
      minimumEffort: "medium",
      maximumEffort: "medium",
      preferredProviders: Object.freeze(["local"]),
      allowedProviders: Object.freeze(["local"]),
      ...(allowedRuntimes === undefined
        ? {}
        : { allowedRuntimes: Object.freeze([...allowedRuntimes]) }),
      contextBudget: Object.freeze({
        maxFiles: 1,
        maxCharacters: 1_000,
        maxEstimatedTokens: 250,
        includeFullFiles: false,
      }),
      executionBudget: Object.freeze({
        maxTokens: 10,
        maxCostUsd: 1,
        maxDurationMs: 1_000,
        maxCalls: 1,
        maxRepairs: 0,
      }),
      rationale: Object.freeze(["V14.3 fixture"]),
    }),
    selectionRequest: Object.freeze({
      requiredCapabilities: Object.freeze(["code_edit"]),
      requiredPermissions: Object.freeze([
        "read_only",
        "write_worktree",
        "shell_exec",
      ]),
      minEffort: "medium",
      maxEffort: "medium",
    }),
    selection: Object.freeze({
      outcome: "selected",
      profile: selectedProfile,
      rejected: Object.freeze([]),
    }),
    reasons: Object.freeze(["selected for V14.3 fixture"]),
  });
}

function task(): RoadmapCandidate {
  return Object.freeze({
    path: "docs/roadmap/loop-engine.md",
    line: 20,
    text: "Lot V14.3",
    kind: "safe",
    reason: "active vertical slice",
    status: "todo",
    priority: "p1",
  });
}

function contextPackage(): MinimalContextPackage {
  return Object.freeze({
    project: "loop-engine",
    budget: Object.freeze({
      maxFiles: 1,
      maxCharacters: 1_000,
      maxEstimatedTokens: 250,
      includeFullFiles: false,
    }),
    files: Object.freeze([]),
    omitted: Object.freeze([]),
    totalCharacters: 0,
    estimatedTokens: 0,
    truncated: false,
  });
}

function executionContext(
  resolvedPolicy: AgentPolicyResolution = policy(),
  options: Partial<PreparedInboundRuntimeExecutionContext> = {},
): PreparedInboundRuntimeExecutionContext {
  return Object.freeze({
    task: task(),
    contextPackage: contextPackage(),
    policy: resolvedPolicy,
    provider: "local",
    ...options,
  });
}

function counters() {
  return {
    verifier: 0,
    replay: 0,
    authorizer: 0,
    assembler: 0,
    context: 0,
    runtimeResolve: 0,
    runtimeExecute: 0,
  };
}

function successfulRuntimeResult(request: RuntimeRequest): RuntimeResult {
  return Object.freeze({
    runtimeId: request.requestedRuntime ?? null,
    status: "completed",
    startedAt: request.requestedAt,
    completedAt: request.requestedAt,
    diagnostics: Object.freeze(["internal detail must not cross"]),
    output: Object.freeze({ secret: "raw output must not cross" }),
    metadata: request.metadata,
  });
}

function runtimeResolver(
  calls: ReturnType<typeof counters>,
  execute: (request: RuntimeRequest) => RuntimeResult | Promise<RuntimeResult> =
    successfulRuntimeResult,
) {
  return (request: RuntimeRequest) => {
    calls.runtimeResolve += 1;
    const adapter: RuntimeAdapter = Object.freeze({
      runtimeId: request.requestedRuntime ?? "custom",
      capabilities: Object.freeze([]),
      supports: () => true,
      execute(runtimeRequest) {
        calls.runtimeExecute += 1;
        return execute(runtimeRequest);
      },
    });
    return Object.freeze({ outcome: "selected" as const, adapter });
  };
}

function dependencies(
  calls: ReturnType<typeof counters>,
  options: Readonly<{
    runtimeId?: string;
    resolvedPolicy?: AgentPolicyResolution;
    context?: PreparedInboundRuntimeExecutionContext;
    runtimeExecute?: (request: RuntimeRequest) => RuntimeResult | Promise<RuntimeResult>;
  }> = {},
): PreparedInboundRuntimeExecutionDependencies {
  const context =
    options.context ?? executionContext(options.resolvedPolicy ?? policy());

  return {
    verifier: {
      verify() {
        calls.verifier += 1;
        return { verified: true, evidence: evidence() };
      },
    },
    replayProtectionPort: {
      check() {
        calls.replay += 1;
        return { accepted: true, receivedAt: EVALUATED_AT };
      },
    },
    authorizer: {
      authorize() {
        calls.authorizer += 1;
        return { authorized: true };
      },
    },
    assembler: {
      assemble() {
        calls.assembler += 1;
        return {
          assembled: true,
          assembly: assembly(options.runtimeId ?? "custom"),
        };
      },
    },
    executionContextResolver: {
      resolve() {
        calls.context += 1;
        return { resolved: true, context };
      },
    },
    runtimeResolver: runtimeResolver(calls, options.runtimeExecute),
  };
}

function assertNoSensitiveRuntimeData(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    "raw-secret-never-forward",
    "/usr/bin/node",
    "--version",
    "raw output must not cross",
    "internal detail must not cross",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
}

describe("executePreparedInboundRuntimeRequest", () => {
  it("returns a frozen dry-run plan without invoking the selected adapter", async () => {
    const calls = counters();
    const result = await executePreparedInboundRuntimeRequest(
      envelope("dry-run"),
      dependencies(calls),
    );

    assert.equal(result.outcome, "planned");
    assert.equal(calls.verifier, 1);
    assert.equal(calls.replay, 1);
    assert.equal(calls.authorizer, 1);
    assert.equal(calls.assembler, 1);
    assert.equal(calls.context, 1);
    assert.equal(calls.runtimeResolve, 1);
    assert.equal(calls.runtimeExecute, 0);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(result.schemaVersion, PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION);
    if (result.outcome === "planned") {
      assert.equal(result.plan.mode, "dry-run");
      assert.equal(result.plan.runtimeId, "custom");
      assert.equal(Object.isFrozen(result.plan), true);
    }
    assertNoSensitiveRuntimeData(result);
  });

  it("executes the selected simulated boundary once and returns a redacted receipt", async () => {
    const calls = counters();
    const result = await executePreparedInboundRuntimeRequest(
      envelope("execute"),
      dependencies(calls),
    );

    assert.equal(result.outcome, "executed");
    assert.deepEqual(calls, {
      verifier: 1,
      replay: 1,
      authorizer: 1,
      assembler: 1,
      context: 1,
      runtimeResolve: 1,
      runtimeExecute: 1,
    });
    if (result.outcome === "executed") {
      assert.equal(result.receipt.status, "completed");
      assert.equal(result.receipt.runtimeInvoked, true);
      assert.equal(result.receipt.effectStarted, false);
      assert.equal(result.receipt.errorCode, null);
      assert.equal(Object.isFrozen(result.receipt), true);
    }
    assertNoSensitiveRuntimeData(result);
  });

  it("stops before execution context and Runtime resolution when inbound validation fails", async () => {
    const calls = counters();
    const invalid = { requestId: REQUEST_ID } as unknown as InboundLoopRuntimeRequestEnvelope;
    const result = await executePreparedInboundRuntimeRequest(
      invalid,
      dependencies(calls),
    );

    assert.deepEqual(result, {
      schemaVersion: PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
      outcome: "rejected",
      requestId: null,
      stage: "inbound",
      reason: "malformed_envelope",
    });
    assert.equal(calls.context, 0);
    assert.equal(calls.runtimeResolve, 0);
    assert.equal(calls.runtimeExecute, 0);
  });

  it("stops before Runtime resolution when policy admission denies the prepared runtime", async () => {
    const calls = counters();
    const result = await executePreparedInboundRuntimeRequest(
      envelope(),
      dependencies(calls, { resolvedPolicy: policy(["codex"]) }),
    );

    assert.equal(result.outcome, "rejected");
    if (result.outcome === "rejected") {
      assert.equal(result.stage, "runtime_admission");
      assert.equal(result.reason, "runtime_execution_runtime_not_allowed");
    }
    assert.equal(calls.context, 1);
    assert.equal(calls.runtimeResolve, 0);
    assert.equal(calls.runtimeExecute, 0);
  });

  it("fails closed when the execution context resolver throws", async () => {
    const calls = counters();
    const deps = dependencies(calls);
    const result = await executePreparedInboundRuntimeRequest(envelope(), {
      ...deps,
      executionContextResolver: {
        resolve() {
          calls.context += 1;
          throw new Error("private resolver failure");
        },
      },
    });

    assert.equal(result.outcome, "rejected");
    if (result.outcome === "rejected") {
      assert.equal(result.stage, "execution_context");
      assert.equal(result.reason, "execution_context_unavailable");
    }
    assert.equal(calls.runtimeResolve, 0);
    assert.equal(calls.runtimeExecute, 0);
    assertNoSensitiveRuntimeData(result);
  });

  it("rejects local-process execution without an explicit execution policy", async () => {
    const calls = counters();
    const result = await executePreparedInboundRuntimeRequest(
      envelope(),
      dependencies(calls, {
        runtimeId: "local-process",
        resolvedPolicy: policy(undefined),
      }),
    );

    assert.equal(result.outcome, "rejected");
    if (result.outcome === "rejected") {
      assert.equal(result.stage, "execution_context");
      assert.equal(result.reason, "execution_context_invalid");
    }
    assert.equal(calls.runtimeResolve, 0);
    assert.equal(calls.runtimeExecute, 0);
  });

  it("fails closed when the selected adapter throws", async () => {
    const calls = counters();
    const result = await executePreparedInboundRuntimeRequest(
      envelope(),
      dependencies(calls, {
        runtimeExecute() {
          throw new Error("private adapter failure");
        },
      }),
    );

    assert.deepEqual(result, {
      schemaVersion: PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
      outcome: "failed",
      requestId: REQUEST_ID,
      stage: "runtime_execution",
      reason: "runtime_execution_failed",
    });
    assert.equal(calls.runtimeExecute, 1);
    assertNoSensitiveRuntimeData(result);
  });

  it("rejects a malformed Runtime result without exposing it", async () => {
    const calls = counters();
    const result = await executePreparedInboundRuntimeRequest(
      envelope(),
      dependencies(calls, {
        runtimeExecute() {
          return {
            runtimeId: "wrong-runtime",
            status: "completed",
            startedAt: EVALUATED_AT,
            completedAt: EVALUATED_AT,
            diagnostics: [],
            output: { secret: "raw output must not cross" },
            metadata: {},
          } as unknown as RuntimeResult;
        },
      }),
    );

    assert.equal(result.outcome, "failed");
    if (result.outcome === "failed") {
      assert.equal(result.reason, "runtime_result_invalid");
    }
    assert.equal(calls.runtimeExecute, 1);
    assertNoSensitiveRuntimeData(result);
  });
});
