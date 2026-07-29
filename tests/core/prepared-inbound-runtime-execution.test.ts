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
import type { MinimalContextPackage } from "../../src/context/types.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { AgentPolicyResolution } from "../../src/policy/types.js";
import type {
  RuntimeAdapter,
  RuntimeRequest,
  RuntimeResult,
} from "../../src/runtime/index.js";
import type {
  InboundAuthenticationEvidence,
  InboundAuthenticationInput,
  InboundPrincipal,
} from "../../src/inbound-security/index.js";

const NOW = "2026-07-29T18:00:00.000Z";
const REQUEST_ID = "request-v14-3";

const authenticationInput: InboundAuthenticationInput = Object.freeze({
  method: "opaque",
  credential: "raw-secret-never-forward",
  issuerHint: "issuer-1",
  subjectHint: "principal-1",
});

function evidence(): InboundAuthenticationEvidence {
  return Object.freeze({
    evidenceId: "evidence-1",
    method: "opaque",
    subjectId: "principal-1",
    issuerId: "issuer-1",
    credentialFingerprint: "fingerprint-1",
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

function envelope(
  mode: "execute" | "dry-run" = "execute",
): InboundLoopRuntimeRequestEnvelope {
  return Object.freeze({
    requestId: REQUEST_ID,
    authenticationInput,
    verificationContext: Object.freeze({
      requestId: REQUEST_ID,
      evaluatedAt: NOW,
    }),
    principal: principal(),
    accessRequest: Object.freeze({
      requestId: REQUEST_ID,
      principalId: "principal-1",
      tenantId: "tenant-1",
      project: "loop-engine",
      operation: mode,
    }),
    replayEvidence: Object.freeze({
      requestId: REQUEST_ID,
      evidenceId: "evidence-1",
      receivedAt: NOW,
      nonce: "nonce-1",
      replayed: false,
    }),
    policy: Object.freeze({
      allowedOperations: Object.freeze(["execute", "dry-run"]),
      replayCheckRequired: true,
    }),
    evaluatedAt: NOW,
    payload: Object.freeze({
      schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
      project: "loop-engine",
      cycleId: "cycle-v14-3",
      mode,
      policyRef: "policy.ref",
      profileRef: "profile.ref",
      requestedMaxEffort: "medium",
      budget: Object.freeze({
        maxTokens: 10,
        maxCostUsd: 1,
        maxDurationMs: 1_000,
        maxCalls: 1,
        maxRepairs: 0,
      }),
    }),
  });
}

function assembly(runtimeId = "custom"): LoopRuntimeAuthorizedEngineAssembly {
  return Object.freeze({
    catalog: Object.freeze({
      policies: Object.freeze([
        Object.freeze({
          ref: "policy.ref",
          value: Object.freeze({
            policyRef: "policy.ref",
            policyId: "policy-id",
          }),
        }),
      ]),
      profiles: Object.freeze([
        Object.freeze({
          ref: "profile.ref",
          value: Object.freeze({
            profileRef: "profile.ref",
            profileId: "profile-id",
            maxEffort: "medium",
          }),
        }),
      ]),
    }),
    limits: Object.freeze({
      maxEffort: "medium",
      budget: Object.freeze({
        maxTokens: 10,
        maxCostUsd: 1,
        maxDurationMs: 1_000,
        maxCalls: 1,
        maxRepairs: 0,
      }),
    }),
    binding: Object.freeze({
      runtimeId,
      executable: "/usr/bin/node",
      arguments: Object.freeze(["--version"]),
      cwd: "/workspace/loop-engine",
    }),
  });
}

function resolvedPolicy(
  allowedRuntimes: readonly "custom"[] = ["custom"],
): AgentPolicyResolution {
  const profile = Object.freeze({
    id: "profile-id",
    runtime: "custom" as const,
    provider: "local" as const,
    model: "simulated",
    effort: "medium" as const,
    capabilities: Object.freeze(["code_edit" as const]),
    permissions: Object.freeze([
      "read_only" as const,
      "write_worktree" as const,
      "shell_exec" as const,
    ]),
    budget: Object.freeze({
      maxTokens: 10,
      maxCostUsd: 1,
      maxDurationMs: 1_000,
      maxCalls: 1,
      maxRepairs: 0,
    }),
  });

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
      allowedRuntimes: Object.freeze([...allowedRuntimes]),
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
      profile,
      rejected: Object.freeze([]),
    }),
    reasons: Object.freeze(["selected"]),
  });
}

function runtimeContext(
  policy = resolvedPolicy(),
): PreparedInboundRuntimeExecutionContext {
  const task: RoadmapCandidate = Object.freeze({
    path: "docs/roadmap/loop-engine.md",
    line: 20,
    text: "Lot V14.3",
    kind: "safe",
    reason: "active vertical slice",
    status: "todo",
    priority: "p1",
  });
  const contextPackage: MinimalContextPackage = Object.freeze({
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
  return Object.freeze({
    task,
    contextPackage,
    policy,
    provider: "local",
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

function dependencies(
  calls: ReturnType<typeof counters>,
  options: Readonly<{
    runtimeId?: string;
    context?: PreparedInboundRuntimeExecutionContext;
    execute?: (request: RuntimeRequest) => RuntimeResult | Promise<RuntimeResult>;
  }> = {},
): PreparedInboundRuntimeExecutionDependencies {
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
        return { accepted: true, receivedAt: NOW };
      },
    },
    authorizer: {
      authorize() {
        calls.authorizer += 1;
        return { authorized: true };
      },
    },
    assembler: {
      allowDryRunPreparation: true,
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
        return {
          resolved: true,
          context: options.context ?? runtimeContext(),
        };
      },
    },
    runtimeResolver(request) {
      calls.runtimeResolve += 1;
      const adapter: RuntimeAdapter = Object.freeze({
        runtimeId: request.requestedRuntime ?? "custom",
        capabilities: Object.freeze([]),
        supports: () => true,
        execute(runtimeRequest) {
          calls.runtimeExecute += 1;
          if (options.execute) return options.execute(runtimeRequest);
          return Object.freeze({
            runtimeId: runtimeRequest.requestedRuntime ?? "custom",
            status: "completed",
            startedAt: runtimeRequest.requestedAt,
            completedAt: runtimeRequest.requestedAt,
            diagnostics: Object.freeze(["private runtime diagnostic"]),
            output: Object.freeze({ secret: "private runtime output" }),
            metadata: runtimeRequest.metadata,
          });
        },
      });
      return Object.freeze({ outcome: "selected", adapter });
    },
  };
}

function assertRedacted(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const secret of [
    "raw-secret-never-forward",
    "/usr/bin/node",
    "--version",
    "private runtime diagnostic",
    "private runtime output",
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
}

describe("executePreparedInboundRuntimeRequest", () => {
  it("plans dry-run once without invoking the selected adapter", async () => {
    const calls = counters();
    const result = await executePreparedInboundRuntimeRequest(
      envelope("dry-run"),
      dependencies(calls),
    );

    assert.equal(result.outcome, "planned");
    assert.deepEqual(calls, {
      verifier: 1,
      replay: 1,
      authorizer: 1,
      assembler: 1,
      context: 1,
      runtimeResolve: 1,
      runtimeExecute: 0,
    });
    assert.equal(Object.isFrozen(result), true);
    if (result.outcome === "planned") {
      assert.equal(result.plan.mode, "dry-run");
      assert.equal(result.plan.runtimeId, "custom");
      assert.equal(Object.isFrozen(result.plan), true);
    }
    assertRedacted(result);
  });

  it("executes once and returns a frozen redacted receipt", async () => {
    const calls = counters();
    const result = await executePreparedInboundRuntimeRequest(
      envelope(),
      dependencies(calls),
    );

    assert.equal(result.outcome, "executed");
    assert.equal(calls.runtimeExecute, 1);
    if (result.outcome === "executed") {
      assert.equal(result.receipt.status, "completed");
      assert.equal(result.receipt.runtimeInvoked, true);
      assert.equal(result.receipt.effectStarted, false);
      assert.equal(result.receipt.errorCode, null);
      assert.equal(Object.isFrozen(result.receipt), true);
    }
    assertRedacted(result);
  });

  it("stops malformed inbound input before every dependency", async () => {
    const calls = counters();
    const result = await executePreparedInboundRuntimeRequest(
      { requestId: REQUEST_ID } as unknown as InboundLoopRuntimeRequestEnvelope,
      dependencies(calls),
    );

    assert.deepEqual(result, {
      schemaVersion: PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
      outcome: "rejected",
      requestId: null,
      stage: "inbound",
      reason: "malformed_envelope",
    });
    assert.equal(calls.verifier, 0);
    assert.equal(calls.context, 0);
    assert.equal(calls.runtimeResolve, 0);
    assert.equal(calls.runtimeExecute, 0);
  });

  it("stops policy denial before Runtime resolution", async () => {
    const calls = counters();
    const context = runtimeContext(resolvedPolicy(["custom"]));
    const deniedPolicy = Object.freeze({
      ...context.policy,
      requirements: Object.freeze({
        ...context.policy.requirements,
        allowedRuntimes: Object.freeze(["codex" as const]),
      }),
    });
    const result = await executePreparedInboundRuntimeRequest(
      envelope(),
      dependencies(calls, { context: runtimeContext(deniedPolicy) }),
    );

    assert.equal(result.outcome, "rejected");
    if (result.outcome === "rejected") {
      assert.equal(result.stage, "runtime_admission");
      assert.equal(result.reason, "runtime_execution_runtime_not_allowed");
    }
    assert.equal(calls.runtimeResolve, 0);
    assert.equal(calls.runtimeExecute, 0);
  });

  it("requires explicit local-process execution policy", async () => {
    const calls = counters();
    const result = await executePreparedInboundRuntimeRequest(
      envelope(),
      dependencies(calls, { runtimeId: "local-process" }),
    );

    assert.equal(result.outcome, "rejected");
    if (result.outcome === "rejected") {
      assert.equal(result.stage, "execution_context");
      assert.equal(result.reason, "execution_context_invalid");
    }
    assert.equal(calls.runtimeResolve, 0);
    assert.equal(calls.runtimeExecute, 0);
  });

  it("fails closed on context and adapter exceptions", async () => {
    const contextCalls = counters();
    const contextDependencies = dependencies(contextCalls);
    const contextFailure = await executePreparedInboundRuntimeRequest(envelope(), {
      ...contextDependencies,
      executionContextResolver: {
        resolve() {
          contextCalls.context += 1;
          throw new Error("private context failure");
        },
      },
    });
    assert.equal(contextFailure.outcome, "rejected");
    if (contextFailure.outcome === "rejected") {
      assert.equal(contextFailure.reason, "execution_context_unavailable");
    }

    const adapterCalls = counters();
    const adapterFailure = await executePreparedInboundRuntimeRequest(
      envelope(),
      dependencies(adapterCalls, {
        execute() {
          throw new Error("private adapter failure");
        },
      }),
    );
    assert.deepEqual(adapterFailure, {
      schemaVersion: PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
      outcome: "failed",
      requestId: REQUEST_ID,
      stage: "runtime_execution",
      reason: "runtime_execution_failed",
    });
    assertRedacted(adapterFailure);
  });
});
