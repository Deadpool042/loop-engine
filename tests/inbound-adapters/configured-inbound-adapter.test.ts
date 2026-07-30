import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  executeConfiguredInboundAdapterRequest,
  hashConfiguredApiKeySecret,
  type ConfiguredApiKeyCredentialRecord,
  type ConfiguredInboundAclRule,
  type ConfiguredInboundAdapterDependencies,
  type ConfiguredInboundAdapterRequest,
  type LoopRuntimeAuthorizedEngineAssembly,
  type PreparedInboundRuntimeExecutionContext,
} from "../../src/core/index.js";
import type { MinimalContextPackage } from "../../src/context/types.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { AgentPolicyResolution } from "../../src/policy/types.js";
import type {
  RuntimeAdapter,
  RuntimeRequest,
  RuntimeResult,
} from "../../src/runtime/index.js";

const NOW = "2026-07-30T04:30:00.000Z";
const SECRET = "pilot-secret-never-report";

function credentialRecord(): ConfiguredApiKeyCredentialRecord {
  return Object.freeze({
    credentialId: "credential-1",
    secretSha256: hashConfiguredApiKeySecret(SECRET),
    issuerId: "loop-engine-local-operator",
    subjectId: "principal-1",
    principal: Object.freeze({
      principalId: "principal-1",
      principalType: "operator",
      tenantId: "tenant-1",
      roles: Object.freeze(["operator"]),
    }),
    issuedAt: "2026-07-30T03:00:00.000Z",
    validFrom: "2026-07-30T03:00:00.000Z",
    expiresAt: "2026-07-30T06:00:00.000Z",
  });
}

function aclRule(requiredRoles: readonly string[] = ["operator"]): ConfiguredInboundAclRule {
  return Object.freeze({
    ruleId: "tenant-1-operator",
    tenantId: "tenant-1",
    requiredRoles: Object.freeze([...requiredRoles]),
    projects: Object.freeze(["loop-engine"]),
    operations: Object.freeze(["dry-run", "execute"]),
  });
}

function adapterRequest(
  requestId = "request-v14-5",
  secret = SECRET,
  nonce = `nonce-${requestId}`,
): ConfiguredInboundAdapterRequest {
  return Object.freeze({
    requestId,
    evaluatedAt: NOW,
    credentialId: "credential-1",
    credentialSecret: secret,
    nonce,
    project: "loop-engine",
    operation: "execute",
    payload: Object.freeze({
      schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
      project: "loop-engine",
      cycleId: "cycle-v14-5",
      mode: "execute",
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

function assembly(): LoopRuntimeAuthorizedEngineAssembly {
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
      runtimeId: "custom",
      executable: "/private/provider-command",
      arguments: Object.freeze(["--private"]),
      cwd: "/private/workspace",
    }),
  });
}

function resolvedPolicy(): AgentPolicyResolution {
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
      allowedRuntimes: Object.freeze(["custom"]),
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
      rationale: Object.freeze(["V14.5 configured adapter fixture"]),
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

function executionContext(): PreparedInboundRuntimeExecutionContext {
  const task: RoadmapCandidate = Object.freeze({
    path: "docs/roadmap/loop-engine.md",
    line: 22,
    text: "Lot V14.5",
    kind: "safe",
    reason: "configured inbound adapter pilot",
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
    policy: resolvedPolicy(),
    provider: "local",
  });
}

function counters() {
  return {
    authorizer: 0,
    assembler: 0,
    context: 0,
    runtimeResolve: 0,
    runtimeExecute: 0,
  };
}

function dependencies(
  replayDirectory: string,
  calls: ReturnType<typeof counters>,
  options: Readonly<{
    credentialRecords?: readonly ConfiguredApiKeyCredentialRecord[];
    aclRules?: readonly ConfiguredInboundAclRule[];
  }> = {},
): ConfiguredInboundAdapterDependencies {
  return {
    credentialRecords: options.credentialRecords ?? Object.freeze([credentialRecord()]),
    aclRules: options.aclRules ?? Object.freeze([aclRule()]),
    replayDirectory,
    authorizer: {
      authorize() {
        calls.authorizer += 1;
        return Object.freeze({ authorized: true as const });
      },
    },
    assembler: {
      allowDryRunPreparation: true,
      assemble() {
        calls.assembler += 1;
        return Object.freeze({ assembled: true as const, assembly: assembly() });
      },
    },
    executionContextResolver: {
      resolve() {
        calls.context += 1;
        return Object.freeze({ resolved: true as const, context: executionContext() });
      },
    },
    runtimeResolver(request: RuntimeRequest) {
      calls.runtimeResolve += 1;
      const adapter: RuntimeAdapter = Object.freeze({
        runtimeId: request.requestedRuntime ?? "custom",
        capabilities: Object.freeze([]),
        supports: () => true,
        execute(runtimeRequest): RuntimeResult {
          calls.runtimeExecute += 1;
          return Object.freeze({
            runtimeId: runtimeRequest.requestedRuntime ?? "custom",
            status: "completed",
            startedAt: runtimeRequest.requestedAt,
            completedAt: runtimeRequest.requestedAt,
            diagnostics: Object.freeze(["private-runtime-diagnostic"]),
            output: Object.freeze({ secret: "private-runtime-output" }),
            metadata: runtimeRequest.metadata,
          });
        },
      });
      return Object.freeze({ outcome: "selected" as const, adapter });
    },
  };
}

function withReplayDirectory(
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "loop-engine-v14-5-"));
  return run(directory).finally(() => rmSync(directory, { recursive: true, force: true }));
}

function assertRedacted(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const secret of [
    SECRET,
    hashConfiguredApiKeySecret(SECRET),
    "/private/provider-command",
    "--private",
    "private-runtime-diagnostic",
    "private-runtime-output",
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
}

describe("executeConfiguredInboundAdapterRequest", () => {
  it("executes through configured identity, ACL and persistent replay once", async () => {
    await withReplayDirectory(async (directory) => {
      const calls = counters();
      const request = adapterRequest();

      const first = await executeConfiguredInboundAdapterRequest(
        request,
        dependencies(directory, calls),
      );
      assert.equal(first.outcome, "executed");
      assert.equal(calls.authorizer, 1);
      assert.equal(calls.assembler, 1);
      assert.equal(calls.context, 1);
      assert.equal(calls.runtimeResolve, 1);
      assert.equal(calls.runtimeExecute, 1);
      assertRedacted(first);

      const second = await executeConfiguredInboundAdapterRequest(
        request,
        dependencies(directory, calls),
      );
      assert.deepEqual(second, {
        schemaVersion: 1,
        outcome: "rejected",
        requestId: request.requestId,
        stage: "security",
        reason: "replay_rejected",
      });
      assert.equal(calls.authorizer, 1);
      assert.equal(calls.runtimeExecute, 1);
      assertRedacted(second);
    });
  });

  it("rejects a reused nonce for the same credential across request ids", async () => {
    await withReplayDirectory(async (directory) => {
      const calls = counters();
      const nonce = "shared-credential-nonce";
      const first = await executeConfiguredInboundAdapterRequest(
        adapterRequest("request-nonce-a", SECRET, nonce),
        dependencies(directory, calls),
      );
      assert.equal(first.outcome, "executed");

      const second = await executeConfiguredInboundAdapterRequest(
        adapterRequest("request-nonce-b", SECRET, nonce),
        dependencies(directory, calls),
      );
      assert.deepEqual(second, {
        schemaVersion: 1,
        outcome: "rejected",
        requestId: "request-nonce-b",
        stage: "security",
        reason: "replay_rejected",
      });
      assert.equal(calls.authorizer, 1);
      assert.equal(calls.assembler, 1);
      assert.equal(calls.context, 1);
      assert.equal(calls.runtimeResolve, 1);
      assert.equal(calls.runtimeExecute, 1);
      assertRedacted(second);
    });
  });

  it("rejects a wrong secret before replay persistence and downstream work", async () => {
    const parent = mkdtempSync(join(tmpdir(), "loop-engine-v14-5-auth-"));
    const directory = join(parent, "claims");
    try {
      const calls = counters();
      const result = await executeConfiguredInboundAdapterRequest(
        adapterRequest("request-wrong-secret", "wrong-secret"),
        dependencies(directory, calls),
      );

      assert.deepEqual(result, {
        schemaVersion: 1,
        outcome: "rejected",
        requestId: "request-wrong-secret",
        stage: "authentication",
        reason: "verification_rejected",
      });
      assert.equal(existsSync(directory), false);
      assert.deepEqual(calls, {
        authorizer: 0,
        assembler: 0,
        context: 0,
        runtimeResolve: 0,
        runtimeExecute: 0,
      });
      assertRedacted(result);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("fails closed on role ACL denial without consuming the replay nonce", async () => {
    const parent = mkdtempSync(join(tmpdir(), "loop-engine-v14-5-acl-"));
    const directory = join(parent, "claims");
    try {
      const calls = counters();
      const result = await executeConfiguredInboundAdapterRequest(
        adapterRequest("request-acl-denied"),
        dependencies(directory, calls, {
          aclRules: Object.freeze([aclRule(["administrator"])]),
        }),
      );

      assert.deepEqual(result, {
        schemaVersion: 1,
        outcome: "rejected",
        requestId: "request-acl-denied",
        stage: "acl",
        reason: "role_not_authorized",
      });
      assert.equal(existsSync(directory), false);
      assert.equal(calls.authorizer, 0);
      assert.equal(calls.runtimeExecute, 0);
      assertRedacted(result);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  it("rejects invalid credential configuration before every dependency", async () => {
    await withReplayDirectory(async (directory) => {
      const calls = counters();
      const record = credentialRecord();
      const result = await executeConfiguredInboundAdapterRequest(
        adapterRequest("request-invalid-config"),
        dependencies(directory, calls, {
          credentialRecords: Object.freeze([record, record]),
        }),
      );

      assert.deepEqual(result, {
        schemaVersion: 1,
        outcome: "rejected",
        requestId: "request-invalid-config",
        stage: "adapter",
        reason: "credential_configuration_invalid",
      });
      assert.deepEqual(calls, {
        authorizer: 0,
        assembler: 0,
        context: 0,
        runtimeResolve: 0,
        runtimeExecute: 0,
      });
    });
  });

  it("rejects accessor-shaped requests without reading the secret", async () => {
    let secretReads = 0;
    const request = {
      requestId: "request-accessor",
      evaluatedAt: NOW,
      credentialId: "credential-1",
      get credentialSecret() {
        secretReads += 1;
        return SECRET;
      },
      nonce: "nonce-accessor",
      project: "loop-engine",
      operation: "execute",
      payload: {},
    } as ConfiguredInboundAdapterRequest;
    const calls = counters();
    const result = await executeConfiguredInboundAdapterRequest(
      request,
      dependencies(join(tmpdir(), "unused-v14-5-replay"), calls),
    );

    assert.equal(result.outcome, "rejected");
    assert.equal(result.stage, "adapter");
    assert.equal(result.reason, "malformed_request");
    assert.equal(secretReads, 0);
    assert.equal(calls.runtimeExecute, 0);
  });
});
