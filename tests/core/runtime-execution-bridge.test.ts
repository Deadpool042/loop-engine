import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  createRuntimeExecutionPlan,
  createRuntimeExecutionReceipt,
  dryRunPolicyAwareDeclarativeRuntimeExecution,
  executeDeclarativeRuntime,
  executePolicyAwareDeclarativeRuntime,
  executePolicyAwareDeclarativeRuntimeWithReceipt,
  evaluateRuntimeExecutionAdmission,
  resolveDeclarativeRuntimeExecution,
  resolvePolicyAwareDeclarativeRuntimeExecution,
  type DeclarativeRuntimeExecutionBridgeInput,
  type DeclarativeRuntimeExecutionMapping,
  type RuntimeExecutionAdmissionInput,
  type RuntimeExecutionPlan,
} from "../../src/core/index.js";
import type {
  AgentBudget,
  AgentEffort,
  AgentProvider,
  AgentRuntime,
} from "../../src/agents/types.js";
import type { LoopRunResult } from "../../src/loop/types.js";
import type { AgentPolicyResolution } from "../../src/policy/types.js";
import type { RuntimeCapabilityInput } from "../../src/runtime/capability/types.js";
import type { RuntimeRegistryInput } from "../../src/runtime/registry/types.js";
import type { RuntimeRequestInput } from "../../src/runtime/request/types.js";
import {
  createSimulatedRuntimeAdapter,
  SimulatedRuntime,
} from "../../src/runtime/simulated.js";

function loopRunResult(
  runtime: AgentRuntime = "codex",
  provider: AgentProvider = "openai",
): LoopRunResult {
  const contextBudget = {
    maxFiles: 1,
    maxCharacters: 100,
    maxEstimatedTokens: 25,
    includeFullFiles: false,
  };
  const shell = runtime === "custom";

  return {
    schemaVersion: 1,
    runId: "bridge-run",
    project: "fixture",
    mode: shell ? "execute" : "plan",
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:00.000Z",
    candidate: {
      path: "docs/roadmap/runtime.md",
      line: 1,
      text: "- [ ] Runtime bridge",
      kind: "safe",
      reason: "fixture",
      status: "todo",
      priority: "default",
    },
    steps: [],
    validation: null,
    modifiedFiles: [],
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: {
      policyId: "fixture-policy",
      mode: shell ? "execute" : "plan",
      status: "resolved",
      requirements: {
        category: "code",
        mode: shell ? "execute" : "plan",
        requiredCapabilities: shell ? ["shell_exec"] : ["code_edit"],
        requiredPermissions: shell ? ["shell_exec"] : ["read_only"],
        minimumEffort: "low",
        maximumEffort: "high",
        contextBudget,
        executionBudget: {
          maxTokens: null,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: shell ? 1 : 0,
          maxRepairs: 0,
        },
        rationale: ["fixture"],
      },
      selectionRequest: {
        requiredCapabilities: shell ? ["shell_exec"] : ["code_edit"],
        requiredPermissions: shell ? ["shell_exec"] : ["read_only"],
      },
      selection: {
        outcome: "selected",
        profile: {
          id: `fixture.${runtime}`,
          runtime,
          provider,
          model: "fixture-model",
          effort: "medium",
          capabilities: shell ? ["shell_exec"] : ["code_edit"],
          permissions: shell ? ["shell_exec"] : ["read_only"],
          budget: {
            maxTokens: null,
            maxCostUsd: null,
            maxDurationMs: null,
            maxCalls: shell ? 1 : 0,
            maxRepairs: 0,
          },
        },
        rejected: [],
      },
      reasons: ["fixture"],
    },
    contextPackage: {
      project: "fixture",
      budget: contextBudget,
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    },
  };
}

const declarativeRequest: RuntimeRequestInput = {
  id: "runtime-request",
  version: "v1",
  createdAt: "2026-07-20T00:00:00.000Z",
  bridge: {
    id: "execution-bridge",
    version: "v1",
    ready: true,
    executionAllowed: false,
    executionStarted: false,
  },
  evidenceReferences: ["bridge:execution-bridge"],
  capabilityRequirements: [
    {
      id: "runtime.code",
      category: "execution",
      version: "v1",
      requiredFeatures: ["edit"],
      acceptedConstraints: ["local-only"],
    },
  ],
};

const runtimeCapability: RuntimeCapabilityInput = {
  id: "runtime.code",
  category: "execution",
  version: "v1",
  supportedFeatures: ["test", "edit"],
  declaredConstraints: ["local-only"],
  compatibilityReferences: [],
};

const declarativeRegistry: RuntimeRegistryInput = {
  id: "runtime-registry",
  version: "v1",
  descriptors: [
    {
      id: "runtime-b",
      version: "v1",
      displayName: "Runtime B",
      lifecycleState: "eligible",
      capabilityReferences: ["runtime.code", "runtime.extra"],
    },
    {
      id: "runtime-a",
      version: "v1",
      displayName: "Runtime A",
      lifecycleState: "eligible",
      capabilityReferences: ["runtime.code"],
    },
    {
      id: "runtime-inactive",
      version: "v1",
      displayName: "Inactive Runtime",
      lifecycleState: "inactive",
      capabilityReferences: ["runtime.code"],
    },
  ],
  compatibilityReferences: [],
};

function bridgeInput(
  options: Partial<DeclarativeRuntimeExecutionBridgeInput> = {},
): DeclarativeRuntimeExecutionBridgeInput {
  return {
    declarativeRequest,
    declarativeRegistry,
    runtimeCapabilities: [runtimeCapability],
    runtimeMapping: {
      "runtime-a": "codex",
      "runtime-b": "claude_code",
    },
    loopRunResult: loopRunResult(),
    ...options,
  };
}

function policyResolution(
  overrides: Partial<AgentPolicyResolution> = {},
): AgentPolicyResolution {
  const base = loopRunResult().agentPolicy!;
  return {
    ...base,
    requirements: {
      ...base.requirements,
      executionBudget: {
        maxTokens: 1_000,
        maxCostUsd: 10,
        maxDurationMs: 60_000,
        maxCalls: 1,
        maxRepairs: 1,
      },
    },
    ...overrides,
  };
}

function admissionInput(
  overrides: Partial<RuntimeExecutionAdmissionInput> = {},
): RuntimeExecutionAdmissionInput {
  return {
    runtimeId: "codex",
    provider: "openai",
    effort: "medium",
    budget: {
      maxTokens: 500,
      maxCostUsd: 5,
      maxDurationMs: 30_000,
      maxCalls: 1,
      maxRepairs: 1,
    },
    policy: policyResolution(),
    ...overrides,
  };
}

function policyAwareBridgeInput(
  overrides: Partial<Parameters<typeof resolvePolicyAwareDeclarativeRuntimeExecution>[0]> = {},
) {
  return {
    ...bridgeInput(),
    admission: {
      policy: policyResolution({
        requirements: {
          ...policyResolution().requirements,
          allowedRuntimes: ["codex"],
          allowedProviders: ["openai"],
        },
      }),
      budget: {
        maxTokens: 500,
        maxCostUsd: 5,
        maxDurationMs: 30_000,
        maxCalls: 1,
        maxRepairs: 1,
      },
    },
    ...overrides,
  };
}

function assertPlanContainsOnlySerializableData(value: unknown): void {
  const visit = (current: unknown, path: string, inArray = false): void => {
    assert.notEqual(typeof current, "function", `${path} is a function`);
    assert.notEqual(typeof current, "symbol", `${path} is a symbol`);
    assert.notEqual(typeof current, "bigint", `${path} is a bigint`);
    assert.notEqual(current instanceof Map, true, `${path} is a Map`);
    assert.notEqual(current instanceof Set, true, `${path} is a Set`);
    assert.notEqual(current instanceof Error, true, `${path} is an Error`);
    assert.notEqual(current instanceof Promise, true, `${path} is a Promise`);
    if (inArray) {
      assert.notEqual(current, undefined, `${path} is undefined in an array`);
    }
    if (current === null || current === undefined) return;
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}[${index}]`, true));
      return;
    }
    if (typeof current === "object") {
      Object.entries(current).forEach(([key, child]) =>
        visit(child, `${path}.${key}`),
      );
    }
  };

  visit(value, "plan");
}

describe("Core declarative runtime execution bridge — pure resolution", () => {
  it("selects one compatible descriptor and builds a V10 RuntimeRequest without exposing capability requirements to V10", () => {
    const result = resolveDeclarativeRuntimeExecution(bridgeInput());

    assert.equal(result.outcome, "resolved");
    if (result.outcome !== "resolved") return;
    assert.equal(result.descriptorId, "runtime-a");
    assert.equal(result.runtimeId, "codex");
    assert.equal(result.v10Resolution.runtimeId, "codex");
    assert.equal(result.runtimeRequest.requestedRuntime, "codex");
    assert.equal("capabilityRequirements" in result.runtimeRequest, false);
    assert.equal(result.runtimeRequest.metadata.runId, "bridge-run");
    assert.equal(Object.isFrozen(result), true);
    assert.equal(
      JSON.stringify(result).includes("function"),
      false,
      "pure resolution must remain serializable data",
    );
  });

  it("keeps the V13 lexical tie-break when multiple descriptors are compatible", () => {
    const result = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        declarativeRegistry: {
          ...declarativeRegistry,
          descriptors: [...declarativeRegistry.descriptors].reverse(),
        },
      }),
    );

    assert.equal(result.outcome, "resolved");
    if (result.outcome !== "resolved") return;
    assert.equal(result.descriptorId, "runtime-a");
    assert.deepEqual(result.declarativeSelection.compatibleRuntimeIds, [
      "runtime-a",
      "runtime-b",
    ]);
  });

  it("allows capabilities that are not required by the declarative request", () => {
    const result = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        runtimeCapabilities: [
          {
            ...runtimeCapability,
            supportedFeatures: ["edit", "test", "review"],
          },
          {
            id: "runtime.extra",
            category: "execution",
            version: "v1",
            supportedFeatures: ["vision"],
            declaredConstraints: [],
            compatibilityReferences: [],
          },
        ],
      }),
    );

    assert.equal(result.outcome, "resolved");
  });

  it("fails closed when a mandatory feature is missing", () => {
    const result = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        runtimeCapabilities: [
          { ...runtimeCapability, supportedFeatures: ["test"] },
        ],
      }),
    );

    assert.equal(result.outcome, "no_compatible_descriptor");
    assert.equal(
      result.declarativeSelection?.candidates[0]?.requirements[0]
        ?.missingFeatures[0],
      "edit",
    );
  });

  it("fails closed when a declared constraint is not accepted", () => {
    const result = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        runtimeCapabilities: [
          { ...runtimeCapability, declaredConstraints: ["network"] },
        ],
      }),
    );

    assert.equal(result.outcome, "no_compatible_descriptor");
    assert.equal(
      result.declarativeSelection?.candidates[0]?.requirements[0]
        ?.unacceptedConstraints[0],
      "network",
    );
  });

  it("fails closed on version and category incompatibilities", () => {
    const versionResult = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        runtimeCapabilities: [{ ...runtimeCapability, version: "v2" }],
      }),
    );
    const categoryResult = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        runtimeCapabilities: [{ ...runtimeCapability, category: "transport" }],
      }),
    );

    assert.equal(versionResult.outcome, "no_compatible_descriptor");
    assert.equal(categoryResult.outcome, "no_compatible_descriptor");
    assert.equal(
      versionResult.declarativeSelection?.candidates[0]?.requirements[0]
        ?.diagnostics[0]?.code,
      "runtime_capability_version_mismatch",
    );
    assert.equal(
      categoryResult.declarativeSelection?.candidates[0]?.requirements[0]
        ?.diagnostics[0]?.code,
      "runtime_capability_category_mismatch",
    );
  });

  it("fails closed when the required capability identifier is not referenced by an eligible descriptor", () => {
    const result = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        declarativeRequest: {
          ...declarativeRequest,
          capabilityRequirements: [
            {
              ...declarativeRequest.capabilityRequirements![0]!,
              id: "runtime.unreferenced",
            },
          ],
        },
      }),
    );

    assert.equal(result.outcome, "no_compatible_descriptor");
    assert.equal(
      result.declarativeSelection?.candidates[0]?.requirements[0]
        ?.diagnostics[0]?.code,
      "runtime_capability_missing",
    );
  });

  it("fails closed when there are no capability requirements or no descriptors", () => {
    const noRequirements = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        declarativeRequest: {
          ...declarativeRequest,
          capabilityRequirements: [],
        },
      }),
    );
    const emptyRegistry = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        declarativeRegistry: { ...declarativeRegistry, descriptors: [] },
      }),
    );

    assert.equal(noRequirements.outcome, "no_compatible_descriptor");
    assert.ok(
      (noRequirements.diagnostics[0]?.details.diagnostics as string[]).some(
        (diagnostic) => /explicit capability requirement/.test(diagnostic),
      ),
    );
    assert.equal(emptyRegistry.outcome, "no_compatible_descriptor");
  });

  it("fails before selection when the declarative request is structurally invalid", () => {
    const result = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        declarativeRequest: { ...declarativeRequest, createdAt: "" },
      }),
    );

    assert.equal(result.outcome, "invalid_declarative_request");
    assert.equal(
      (result.diagnostics[0]?.details.diagnosticCodes as string[])[0],
      "runtime_request_invalid",
    );
    assert.equal(result.declarativeSelection, null);
  });

  it("distinguishes missing mappings from unknown V10 runtimes", () => {
    const missing = resolveDeclarativeRuntimeExecution(
      bridgeInput({ runtimeMapping: {} as DeclarativeRuntimeExecutionMapping }),
    );
    const unknown = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        runtimeMapping: { "runtime-a": "chatgpt" },
      }),
    );

    assert.equal(missing.outcome, "missing_v10_mapping");
    assert.equal(unknown.outcome, "unresolved_v10_runtime");
    assert.match(unknown.v10Resolution?.reason ?? "", /not registered/);
  });

  it("is stable when irrelevant input ordering changes", () => {
    const first = resolveDeclarativeRuntimeExecution(bridgeInput());
    const second = resolveDeclarativeRuntimeExecution(
      bridgeInput({
        declarativeRegistry: {
          ...declarativeRegistry,
          descriptors: [...declarativeRegistry.descriptors].reverse(),
        },
        runtimeCapabilities: [
          {
            ...runtimeCapability,
            supportedFeatures: [...runtimeCapability.supportedFeatures]
              .reverse(),
          },
        ],
      }),
    );

    assert.deepEqual(second, first);
  });
});

describe("Runtime execution policy admission", () => {
  it("admits an explicitly allowed runtime/provider/effort/budget", () => {
    const result = evaluateRuntimeExecutionAdmission(
      admissionInput({
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            allowedRuntimes: ["codex"],
            allowedProviders: ["openai"],
            maximumEffort: "medium",
          },
        }),
      }),
    );

    assert.equal(result.outcome, "admitted");
    assert.equal(result.admitted, true);
    assert.deepEqual(
      result.checks.map((check) => check.status),
      ["passed", "passed", "passed", "passed", "passed"],
    );
  });

  it("denies runtimes outside a non-empty allow-list, including compatible descriptors mapped to forbidden runtimes", () => {
    const result = evaluateRuntimeExecutionAdmission(
      admissionInput({
        runtimeId: "codex",
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            allowedRuntimes: ["claude_code"],
          },
        }),
      }),
    );

    assert.equal(result.outcome, "denied");
    assert.equal(result.reason, "runtime_execution_runtime_not_allowed");
  });

  it("preserves policy semantics for absent and empty runtime restrictions", () => {
    const unrestricted = evaluateRuntimeExecutionAdmission(
      admissionInput({
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            allowedRuntimes: undefined,
          },
        }),
      }),
    );
    const empty = evaluateRuntimeExecutionAdmission(
      admissionInput({
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            allowedRuntimes: [],
          },
        }),
      }),
    );

    assert.equal(unrestricted.outcome, "admitted");
    assert.equal(
      unrestricted.checks.find((check) => check.name === "runtime")?.status,
      "not_applicable",
    );
    assert.equal(empty.outcome, "denied");
    assert.equal(empty.reason, "runtime_execution_runtime_not_allowed");
  });

  it("admits allowed providers, denies forbidden providers, and never infers provider from runtime", () => {
    const allowed = evaluateRuntimeExecutionAdmission(
      admissionInput({
        provider: "openai",
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            allowedProviders: ["openai"],
          },
        }),
      }),
    );
    const denied = evaluateRuntimeExecutionAdmission(
      admissionInput({
        provider: "anthropic",
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            allowedProviders: ["openai"],
          },
        }),
      }),
    );
    const unavailable = evaluateRuntimeExecutionAdmission(
      admissionInput({
        provider: undefined,
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            allowedProviders: ["openai"],
          },
        }),
      }),
    );
    const unrestricted = evaluateRuntimeExecutionAdmission(
      admissionInput({
        provider: undefined,
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            allowedProviders: undefined,
          },
        }),
      }),
    );

    assert.equal(allowed.outcome, "admitted");
    assert.equal(denied.outcome, "denied");
    assert.equal(denied.reason, "runtime_execution_provider_not_allowed");
    assert.equal(unavailable.outcome, "denied");
    assert.equal(
      unavailable.reason,
      "runtime_execution_provider_unverifiable",
    );
    assert.equal(unrestricted.outcome, "admitted");
    assert.equal(
      unrestricted.checks.find((check) => check.name === "provider")?.status,
      "not_available",
    );
  });

  it("checks effort with the existing effort ranking, including lower, equal, higher, and absent effort", () => {
    const basePolicy = policyResolution({
      requirements: { ...policyResolution().requirements, maximumEffort: "high" },
    });
    const lower = evaluateRuntimeExecutionAdmission(
      admissionInput({ effort: "medium", policy: basePolicy }),
    );
    const equal = evaluateRuntimeExecutionAdmission(
      admissionInput({ effort: "high", policy: basePolicy }),
    );
    const higher = evaluateRuntimeExecutionAdmission(
      admissionInput({ effort: "max", policy: basePolicy }),
    );
    const absent = evaluateRuntimeExecutionAdmission(
      admissionInput({ effort: undefined, policy: basePolicy }),
    );

    assert.equal(lower.outcome, "admitted");
    assert.equal(equal.outcome, "admitted");
    assert.equal(higher.outcome, "denied");
    assert.equal(higher.reason, "runtime_execution_effort_exceeds_maximum");
    assert.equal(absent.outcome, "admitted");
    assert.equal(
      absent.checks.find((check) => check.name === "effort")?.status,
      "not_available",
    );
  });

  it("checks every budget field with lower/equal/greater/absent/null/zero semantics", () => {
    const policyBudget: AgentBudget = {
      maxTokens: 100,
      maxCostUsd: 10,
      maxDurationMs: 1_000,
      maxCalls: 1,
      maxRepairs: 0,
    };
    const policy = policyResolution({
      requirements: {
        ...policyResolution().requirements,
        executionBudget: policyBudget,
      },
    });
    const lowerOrEqual = evaluateRuntimeExecutionAdmission(
      admissionInput({
        policy,
        budget: {
          maxTokens: 50,
          maxCostUsd: 10,
          maxDurationMs: 999,
          maxCalls: 1,
          maxRepairs: 0,
        },
      }),
    );
    const exceeded = evaluateRuntimeExecutionAdmission(
      admissionInput({
        policy,
        budget: {
          maxTokens: 101,
          maxCostUsd: 11,
          maxDurationMs: 1_001,
          maxCalls: 2,
          maxRepairs: 1,
        },
      }),
    );
    const absent = evaluateRuntimeExecutionAdmission(
      admissionInput({ policy, budget: undefined }),
    );
    const partial = evaluateRuntimeExecutionAdmission(
      admissionInput({ policy, budget: { maxCalls: 1 } }),
    );
    const unboundedRequestedAgainstBoundedLimit =
      evaluateRuntimeExecutionAdmission(
        admissionInput({ policy, budget: { maxCalls: null } }),
      );
    const unboundedLimit = evaluateRuntimeExecutionAdmission(
      admissionInput({
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            executionBudget: { ...policyBudget, maxTokens: null },
          },
        }),
        budget: { maxTokens: 1_000 },
      }),
    );
    const invalid = evaluateRuntimeExecutionAdmission(
      admissionInput({ policy, budget: { maxCalls: -1 as never } }),
    );

    assert.equal(lowerOrEqual.outcome, "admitted");
    assert.equal(exceeded.outcome, "denied");
    assert.deepEqual(
      exceeded.diagnostics.map((diagnostic) => diagnostic.details.dimension),
      [
        "maxTokens",
        "maxCostUsd",
        "maxDurationMs",
        "maxCalls",
        "maxRepairs",
      ],
    );
    assert.equal(absent.outcome, "admitted");
    assert.equal(
      absent.checks.find((check) => check.name === "budget")?.status,
      "not_available",
    );
    assert.equal(partial.outcome, "admitted");
    assert.equal(unboundedRequestedAgainstBoundedLimit.outcome, "denied");
    assert.equal(unboundedLimit.outcome, "admitted");
    assert.equal(invalid.outcome, "denied");
    assert.equal(
      invalid.reason,
      "runtime_execution_admission_input_inconsistent",
    );
  });

  it("denies when the policy resolution is not resolved", () => {
    const result = evaluateRuntimeExecutionAdmission(
      admissionInput({
        policy: policyResolution({ status: "runtime_not_allowed" }),
      }),
    );

    assert.equal(result.outcome, "denied");
    assert.equal(result.reason, "runtime_execution_policy_not_resolved");
  });

  it("returns stable deterministic output without mutating inputs", () => {
    const input = admissionInput({
      policy: policyResolution({
        requirements: {
          ...policyResolution().requirements,
          allowedRuntimes: ["codex"],
          allowedProviders: ["openai"],
        },
      }),
    });
    const before = structuredClone(input);
    const first = evaluateRuntimeExecutionAdmission(input);
    const second = evaluateRuntimeExecutionAdmission(input);

    assert.deepEqual(input, before);
    assert.deepEqual(second, first);
    assert.equal(Object.isFrozen(first), true);
    assert.doesNotThrow(() => JSON.stringify(first));
  });
});

describe("Policy-aware declarative runtime execution bridge", () => {
  it("resolves only after capability compatibility, mapping, and policy admission all pass", () => {
    const result = resolvePolicyAwareDeclarativeRuntimeExecution(
      policyAwareBridgeInput(),
    );

    assert.equal(result.outcome, "resolved");
    if (result.outcome !== "resolved") return;
    assert.equal(result.descriptorId, "runtime-a");
    assert.equal(result.runtimeId, "codex");
    assert.equal(result.admission.outcome, "admitted");
    assert.equal(result.runtimeRequest.requestedRuntime, "codex");
  });

  it("stops before V10 request construction and resolution when admission is denied", () => {
    const result = resolvePolicyAwareDeclarativeRuntimeExecution(
      policyAwareBridgeInput({
        admission: {
          policy: policyResolution({
            requirements: {
              ...policyResolution().requirements,
              allowedRuntimes: ["claude_code"],
            },
          }),
        },
      }),
    );

    assert.equal(result.outcome, "admission_denied");
    assert.equal(result.runtimeRequest, null);
    assert.equal(result.v10Resolution, null);
    assert.equal(
      result.admission.reason,
      "runtime_execution_runtime_not_allowed",
    );
  });

  it("keeps V13.15 historical resolution unchanged when no policy-aware API is used", () => {
    const historical = resolveDeclarativeRuntimeExecution(bridgeInput());
    const policyAware = resolvePolicyAwareDeclarativeRuntimeExecution(
      policyAwareBridgeInput(),
    );

    assert.equal(historical.outcome, "resolved");
    assert.equal(policyAware.outcome, "resolved");
    if (historical.outcome !== "resolved" || policyAware.outcome !== "resolved") {
      return;
    }
    assert.equal(historical.runtimeId, policyAware.runtimeId);
    assert.equal(historical.runtimeRequest.requestedRuntime, "codex");
    assert.equal("admission" in historical, false);
  });

  it("executes V10 once after admission and propagates V10 errors", async () => {
    const result = await executePolicyAwareDeclarativeRuntime(
      policyAwareBridgeInput(),
    );

    assert.equal(result.outcome, "v10_execution_failed");
    assert.equal(result.runtimeResult?.runtimeId, "codex");
    assert.equal(result.runtimeResult?.status, "not_implemented");
  });

  it("never executes V10 after admission refusal", async () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "loop-policy-aware-denied-")),
    );

    try {
      const result = await executePolicyAwareDeclarativeRuntime(
        policyAwareBridgeInput({
          loopRunResult: loopRunResult("custom", "local"),
          runtimeMapping: { "runtime-a": "local-process" },
          runtimeRequestOptions: {
            allowedProviders: ["local"],
            localProcess: {
              command: {
                executable: process.execPath,
                args: ["-e", "process.stdout.write('should-not-run')"],
                cwd: root,
              },
              executionPolicy: {
                enabled: true,
                projectRoot: root,
                allowedExecutables: [process.execPath],
                allowedEnvironmentKeys: [],
                timeoutMs: 2_000,
                maxStdoutBytes: 128,
                maxStderrBytes: 128,
              },
            },
          },
          admission: {
            policy: policyResolution({
              requirements: {
                ...policyResolution().requirements,
                allowedRuntimes: ["codex"],
              },
            }),
            provider: "local",
            effort: "medium",
            budget: { maxCalls: 1 },
          },
        }),
      );

      assert.equal(result.outcome, "resolution_failed");
      assert.equal(result.runtimeResult, null);
      assert.equal(result.resolution.outcome, "admission_denied");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("executes the selected local-process adapter exactly once after admission", async () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "loop-policy-aware-success-")),
    );

    try {
      const result = await executePolicyAwareDeclarativeRuntime(
        policyAwareBridgeInput({
          loopRunResult: loopRunResult("custom", "local"),
          runtimeMapping: { "runtime-a": "local-process" },
          runtimeRequestOptions: {
            allowedProviders: ["local"],
            localProcess: {
              command: {
                executable: process.execPath,
                args: ["-e", "process.stdout.write('admitted')"],
                cwd: root,
              },
              executionPolicy: {
                enabled: true,
                projectRoot: root,
                allowedExecutables: [process.execPath],
                allowedEnvironmentKeys: [],
                timeoutMs: 2_000,
                maxStdoutBytes: 128,
                maxStderrBytes: 128,
              },
            },
          },
          admission: {
            policy: policyResolution({
              requirements: {
                ...policyResolution().requirements,
                allowedProviders: ["local"],
                executionBudget: {
                  maxTokens: null,
                  maxCostUsd: null,
                  maxDurationMs: null,
                  maxCalls: 1,
                  maxRepairs: 0,
                },
              },
            }),
            provider: "local",
            effort: "medium",
            budget: { maxCalls: 1, maxRepairs: 0 },
          },
        }),
      );

      assert.equal(result.outcome, "success");
      assert.equal(result.runtimeResult.status, "completed");
      assert.equal(result.runtimeResult.stdout, "admitted");
      assert.equal(
        result.runtimeResult.events?.filter(
          (event) => event.type === "process_started",
        ).length,
        1,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Runtime execution plan and dry-run", () => {
  it("builds a deterministic schemaVersion 1 plan after capability selection and policy admission", () => {
    const resolution = resolvePolicyAwareDeclarativeRuntimeExecution(
      policyAwareBridgeInput(),
    );

    assert.equal(resolution.outcome, "resolved");
    if (resolution.outcome !== "resolved") return;

    const plan = createRuntimeExecutionPlan({
      resolution,
      admission: policyAwareBridgeInput().admission,
    });

    assert.equal(plan.schemaVersion, 1);
    assert.equal(plan.descriptorId, "runtime-a");
    assert.equal(plan.runtimeId, "codex");
    assert.equal(plan.capabilityDecision.outcome, "selected");
    assert.deepEqual(plan.capabilityDecision.compatibleRuntimeIds, [
      "runtime-a",
      "runtime-b",
    ]);
    assert.equal(plan.request.requestedRuntime, "codex");
    assert.equal(plan.policyDecision.outcome, "admitted");
    assert.equal(plan.executionConstraints.provider, "openai");
    assert.equal(plan.executionConstraints.effort, "medium");
    assert.deepEqual(plan.executionConstraints.requestedBudget, {
      maxTokens: 500,
      maxCostUsd: 5,
      maxDurationMs: 30_000,
      maxCalls: 1,
      maxRepairs: 1,
    });
    assert.equal(Object.isFrozen(plan), true);
  });

  it("keeps lexical tie-break, explicit mapping, provider not_available, effort ceiling, and exact budget limits", () => {
    const input = policyAwareBridgeInput({
      declarativeRegistry: {
        ...declarativeRegistry,
        descriptors: [...declarativeRegistry.descriptors].reverse(),
      },
      admission: {
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            allowedRuntimes: ["codex"],
            allowedProviders: undefined,
            maximumEffort: "medium",
            executionBudget: {
              maxTokens: 500,
              maxCostUsd: 5,
              maxDurationMs: 30_000,
              maxCalls: 1,
              maxRepairs: 1,
            },
          },
        }),
        effort: "medium",
        budget: {
          maxTokens: 500,
          maxCostUsd: 5,
          maxDurationMs: 30_000,
          maxCalls: 1,
          maxRepairs: 1,
        },
      },
    });
    const dryRun = dryRunPolicyAwareDeclarativeRuntimeExecution(input);

    assert.equal(dryRun.outcome, "planned");
    if (dryRun.outcome !== "planned") return;
    assert.equal(dryRun.plan.descriptorId, "runtime-a");
    assert.equal(dryRun.plan.runtimeId, "codex");
    assert.equal(dryRun.plan.executionConstraints.provider, "openai");
    assert.equal(
      dryRun.plan.policyDecision.checks.find(
        (check) => check.name === "provider",
      )?.status,
      "not_applicable",
    );
    assert.deepEqual(dryRun.plan.executionConstraints.limitBudget, {
      maxTokens: 500,
      maxCostUsd: 5,
      maxDurationMs: 30_000,
      maxCalls: 1,
      maxRepairs: 1,
    });
  });

  it("omits unavailable optional values by normalizing them to null in the plan contract", () => {
    const dryRun = dryRunPolicyAwareDeclarativeRuntimeExecution(
      policyAwareBridgeInput({
        admission: {
          policy: policyResolution({
            requirements: {
              ...policyResolution().requirements,
              allowedRuntimes: undefined,
              allowedProviders: undefined,
            },
            selection: null,
          }),
        },
      }),
    );

    assert.equal(dryRun.outcome, "planned");
    if (dryRun.outcome !== "planned") return;
    assert.equal(dryRun.plan.executionConstraints.allowedProviders, null);
    assert.equal(dryRun.plan.executionConstraints.allowedRuntimes, null);
    assert.equal(dryRun.plan.executionConstraints.provider, null);
    assert.equal(dryRun.plan.executionConstraints.effort, null);
    assert.equal(dryRun.plan.executionConstraints.requestedBudget, null);
  });

  it("returns failures without presenting a partial plan as executable", () => {
    const cases = [
      dryRunPolicyAwareDeclarativeRuntimeExecution(
        policyAwareBridgeInput({
          declarativeRequest: { ...declarativeRequest, createdAt: "" },
        }),
      ),
      dryRunPolicyAwareDeclarativeRuntimeExecution(
        policyAwareBridgeInput({
          runtimeCapabilities: [
            { ...runtimeCapability, supportedFeatures: ["test"] },
          ],
        }),
      ),
      dryRunPolicyAwareDeclarativeRuntimeExecution(
        policyAwareBridgeInput({
          runtimeMapping: {} as DeclarativeRuntimeExecutionMapping,
        }),
      ),
      dryRunPolicyAwareDeclarativeRuntimeExecution(
        policyAwareBridgeInput({
          runtimeMapping: { "runtime-a": "chatgpt" },
          admission: {
            policy: policyResolution({
              requirements: {
                ...policyResolution().requirements,
                allowedRuntimes: undefined,
                allowedProviders: undefined,
              },
            }),
            budget: {
              maxTokens: 500,
              maxCostUsd: 5,
              maxDurationMs: 30_000,
              maxCalls: 1,
              maxRepairs: 1,
            },
          },
        }),
      ),
      dryRunPolicyAwareDeclarativeRuntimeExecution(
        policyAwareBridgeInput({
          admission: {
            policy: policyResolution({
              requirements: {
                ...policyResolution().requirements,
                allowedRuntimes: ["claude_code"],
              },
            }),
          },
        }),
      ),
      dryRunPolicyAwareDeclarativeRuntimeExecution(
        policyAwareBridgeInput({
          admission: {
            policy: policyResolution({
              requirements: {
                ...policyResolution().requirements,
                allowedProviders: ["anthropic"],
              },
            }),
            provider: "openai",
          },
        }),
      ),
      dryRunPolicyAwareDeclarativeRuntimeExecution(
        policyAwareBridgeInput({
          admission: {
            policy: policyResolution({
              requirements: {
                ...policyResolution().requirements,
                allowedProviders: ["openai"],
              },
            }),
            provider: undefined,
          },
        }),
      ),
      dryRunPolicyAwareDeclarativeRuntimeExecution(
        policyAwareBridgeInput({
          admission: {
            policy: policyResolution({
              requirements: {
                ...policyResolution().requirements,
                maximumEffort: "low",
              },
            }),
            effort: "high",
          },
        }),
      ),
      dryRunPolicyAwareDeclarativeRuntimeExecution(
        policyAwareBridgeInput({
          admission: {
            policy: policyResolution(),
            budget: { maxTokens: 2_000 },
          },
        }),
      ),
    ];

    assert.deepEqual(
      cases.map((result) => result.outcome),
      [
        "invalid_declarative_request",
        "no_compatible_descriptor",
        "missing_v10_mapping",
        "unresolved_v10_runtime",
        "admission_denied",
        "admission_denied",
        "admission_denied",
        "admission_denied",
        "admission_denied",
      ],
    );
    assert.ok(cases.every((result) => result.plan === null));
  });

  it("dry-run consults V10 runtime resolution but never executes the selected adapter", () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "loop-runtime-plan-dry-run-")),
    );

    try {
      const result = dryRunPolicyAwareDeclarativeRuntimeExecution(
        policyAwareBridgeInput({
          loopRunResult: loopRunResult("custom", "local"),
          runtimeMapping: { "runtime-a": "local-process" },
          runtimeRequestOptions: {
            allowedProviders: ["local"],
            localProcess: {
              command: {
                executable: process.execPath,
                args: ["-e", "process.stdout.write('must-not-run')"],
                cwd: root,
              },
              executionPolicy: {
                enabled: true,
                projectRoot: root,
                allowedExecutables: [process.execPath],
                allowedEnvironmentKeys: [],
                timeoutMs: 2_000,
                maxStdoutBytes: 128,
                maxStderrBytes: 128,
              },
            },
          },
          admission: {
            policy: policyResolution({
              requirements: {
                ...policyResolution().requirements,
                allowedProviders: ["local"],
                executionBudget: {
                  maxTokens: null,
                  maxCostUsd: null,
                  maxDurationMs: null,
                  maxCalls: 1,
                  maxRepairs: 0,
                },
              },
            }),
            provider: "local",
            effort: "medium",
            budget: { maxCalls: 1, maxRepairs: 0 },
          },
        }),
      );

      assert.equal(result.outcome, "planned");
      if (result.outcome !== "planned") return;
      assert.equal(result.plan.runtimeId, "local-process");
      assert.equal(result.plan.request.localProcessConfigured, true);
      assert.equal("localProcess" in result.plan.request, false);
      assert.equal(JSON.stringify(result.plan).includes(root), false);
      assert.equal(JSON.stringify(result.plan).includes("must-not-run"), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns deterministic JSON-serializable data with no functions, instances, timestamps, random ids, or input mutation", () => {
    const input = policyAwareBridgeInput();
    const before = structuredClone(input);
    const first = dryRunPolicyAwareDeclarativeRuntimeExecution(input);
    const second = dryRunPolicyAwareDeclarativeRuntimeExecution(input);

    assert.deepEqual(input, before);
    assert.deepEqual(second, first);
    assert.equal(first.outcome, "planned");
    if (first.outcome !== "planned") return;

    assertPlanContainsOnlySerializableData(first.plan);
    const serialized = JSON.stringify(first.plan);
    const restored = JSON.parse(serialized) as RuntimeExecutionPlan;
    assert.deepEqual(restored, first.plan);
    assert.equal(serialized.includes("function"), false);
    assert.equal(serialized.includes("Promise"), false);
    assert.equal(serialized.includes("Date.now"), false);
  });

  it("keeps V13.15, V13.16, RuntimeRequest, RuntimeResult, LoopRunResult, and V10 behavior unchanged", async () => {
    const historical = resolveDeclarativeRuntimeExecution(bridgeInput());
    const policyAware = resolvePolicyAwareDeclarativeRuntimeExecution(
      policyAwareBridgeInput(),
    );
    const dryRun = dryRunPolicyAwareDeclarativeRuntimeExecution(
      policyAwareBridgeInput(),
    );
    const executed = await executePolicyAwareDeclarativeRuntime(
      policyAwareBridgeInput(),
    );

    assert.equal(historical.outcome, "resolved");
    assert.equal(policyAware.outcome, "resolved");
    assert.equal(dryRun.outcome, "planned");
    assert.equal(executed.outcome, "v10_execution_failed");
    assert.equal("plan" in policyAware, false);
    assert.equal("runtimeResult" in dryRun, false);
    assert.equal(bridgeInput().loopRunResult.schemaVersion, 1);
  });
});

describe("Core declarative runtime execution bridge — V10 execution", () => {
  it("plans without calling and executes the selected simulated adapter exactly once", async () => {
    const input = policyAwareBridgeInput({
      loopRunResult: loopRunResult("custom", "local"),
      runtimeMapping: { "runtime-a": "custom", "runtime-b": "codex" },
      admission: {
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            allowedRuntimes: ["custom"],
            allowedProviders: ["local"],
          },
        }),
        provider: "local",
        effort: "medium",
        budget: { maxCalls: 1, maxRepairs: 0 },
      },
    });
    const instrumented = SimulatedRuntime as {
      execute: typeof SimulatedRuntime.execute;
    };
    const originalExecute = instrumented.execute;
    let calls = 0;
    instrumented.execute = (request) => {
      calls += 1;
      return originalExecute(request);
    };

    try {
      const dryRun = dryRunPolicyAwareDeclarativeRuntimeExecution(input);
      assert.equal(dryRun.outcome, "planned");
      if (dryRun.outcome !== "planned") return;
      assert.equal(dryRun.plan.descriptorId, "runtime-a");
      assert.equal(dryRun.plan.runtimeId, "custom");
      assert.equal(calls, 0);

      const execution = await executePolicyAwareDeclarativeRuntime(input);
      assert.equal(execution.outcome, "success");
      assert.equal(execution.resolution.descriptorId, dryRun.plan.descriptorId);
      assert.equal(execution.resolution.runtimeId, dryRun.plan.runtimeId);
      assert.equal(execution.runtimeResult.runtimeId, "custom");
      assert.deepEqual(execution.runtimeResult.output, {
        kind: "simulated-runtime-result",
      });
      assert.equal(calls, 1);

      const denied = await executePolicyAwareDeclarativeRuntime({
        ...input,
        admission: {
          ...input.admission,
          policy: policyResolution({
            requirements: {
              ...policyResolution().requirements,
              allowedRuntimes: ["codex"],
            },
          }),
        },
      });
      assert.equal(denied.outcome, "resolution_failed");
      assert.equal(calls, 1);
    } finally {
      instrumented.execute = originalExecute;
    }
  });

  it("delegates to the selected V10 adapter and propagates its result", async () => {
    const result = await executeDeclarativeRuntime(bridgeInput());

    assert.equal(result.outcome, "v10_execution_failed");
    assert.equal(result.runtimeResult?.runtimeId, "codex");
    assert.equal(result.runtimeResult?.status, "not_implemented");
    assert.equal(result.runtimeResult?.metadata.runId, "bridge-run");
  });

  it("does not execute an adapter that was not selected", async () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "loop-bridge-not-selected-")),
    );

    try {
      const result = await executeDeclarativeRuntime(
        bridgeInput({
          runtimeRequestOptions: {
            localProcess: {
              command: {
                executable: process.execPath,
                args: ["-e", "process.stdout.write('not-selected')"],
                cwd: root,
              },
              executionPolicy: {
                enabled: true,
                projectRoot: root,
                allowedExecutables: [process.execPath],
                allowedEnvironmentKeys: [],
                timeoutMs: 2_000,
                maxStdoutBytes: 128,
                maxStderrBytes: 128,
              },
            },
          },
        }),
      );

      assert.equal(result.runtimeResult?.runtimeId, "codex");
      assert.equal(result.runtimeResult?.stdout, undefined);
      assert.equal(result.runtimeResult?.status, "not_implemented");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("propagates a V10 execution error without destructive transformation", async () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "loop-bridge-v10-error-")),
    );

    try {
      const result = await executeDeclarativeRuntime(
        bridgeInput({
          loopRunResult: loopRunResult("custom", "local"),
          runtimeMapping: { "runtime-a": "local-process" },
          runtimeRequestOptions: {
            allowedProviders: ["local"],
            localProcess: {
              command: {
                executable: process.execPath,
                args: ["-e", "process.exit(2)"],
                cwd: root,
              },
              executionPolicy: {
                enabled: true,
                projectRoot: root,
                allowedExecutables: [process.execPath],
                allowedEnvironmentKeys: [],
                timeoutMs: 2_000,
                maxStdoutBytes: 128,
                maxStderrBytes: 128,
              },
            },
          },
        }),
      );

      assert.equal(result.outcome, "v10_execution_failed");
      assert.equal(result.runtimeResult?.status, "non_zero_exit");
      assert.equal(result.runtimeResult?.error?.code, "non_zero_exit");
      assert.equal(result.runtimeResult?.error?.details.exitCode, 2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not execute V10 when declarative resolution fails", async () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "loop-bridge-no-resolution-")),
    );

    try {
      const result = await executeDeclarativeRuntime(
        bridgeInput({
          loopRunResult: loopRunResult("custom", "local"),
          runtimeMapping: {},
          runtimeRequestOptions: {
            localProcess: {
              command: {
                executable: process.execPath,
                args: ["-e", "process.stdout.write('should-not-run')"],
                cwd: root,
              },
              executionPolicy: {
                enabled: true,
                projectRoot: root,
                allowedExecutables: [process.execPath],
                allowedEnvironmentKeys: [],
                timeoutMs: 2_000,
                maxStdoutBytes: 128,
                maxStderrBytes: 128,
              },
            },
          },
        }),
      );

      assert.equal(result.outcome, "resolution_failed");
      assert.equal(result.runtimeResult, null);
      assert.equal(result.resolution.outcome, "missing_v10_mapping");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("executes the selected V10 adapter exactly once on success", async () => {
    const root = realpathSync(
      mkdtempSync(join(tmpdir(), "loop-bridge-success-")),
    );

    try {
      const result = await executeDeclarativeRuntime(
        bridgeInput({
          loopRunResult: loopRunResult("custom", "local"),
          runtimeMapping: { "runtime-a": "local-process" },
          runtimeRequestOptions: {
            allowedProviders: ["local"],
            localProcess: {
              command: {
                executable: process.execPath,
                args: ["-e", "process.stdout.write('once')"],
                cwd: root,
              },
              executionPolicy: {
                enabled: true,
                projectRoot: root,
                allowedExecutables: [process.execPath],
                allowedEnvironmentKeys: [],
                timeoutMs: 2_000,
                maxStdoutBytes: 128,
                maxStderrBytes: 128,
              },
            },
          },
        }),
      );

      assert.equal(result.outcome, "success");
      assert.equal(result.runtimeResult.status, "completed");
      assert.equal(result.runtimeResult.stdout, "once");
      assert.equal(
        result.runtimeResult.events?.filter(
          (event) => event.type === "process_started",
        ).length,
        1,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Runtime Execution Receipt V13.19", () => {
  function simulatedInput() {
    return policyAwareBridgeInput({
      loopRunResult: loopRunResult("custom", "local"),
      runtimeMapping: { "runtime-a": "custom", "runtime-b": "codex" },
      admission: {
        policy: policyResolution({
          requirements: {
            ...policyResolution().requirements,
            allowedRuntimes: ["custom"],
            allowedProviders: ["local"],
          },
        }),
        provider: "local",
        effort: "medium",
        budget: { maxCalls: 1, maxRepairs: 0 },
      },
    });
  }

  it("builds an immutable JSON-safe receipt from a resolved context and RuntimeResult", () => {
    const input = simulatedInput();
    const resolution = resolvePolicyAwareDeclarativeRuntimeExecution(input);
    assert.equal(resolution.outcome, "resolved");
    if (resolution.outcome !== "resolved") return;
    const output = { nested: ["stable"] };
    const runtimeResult = {
      runtimeId: "custom" as const,
      status: "completed" as const,
      startedAt: "2026-07-20T00:00:00.000Z",
      completedAt: "2026-07-20T00:00:00.000Z",
      diagnostics: ["completed"],
      output,
      metadata: { private: "not projected" },
    };
    const beforeResolution = structuredClone(resolution);
    const beforeResult = structuredClone(runtimeResult);

    const receipt = createRuntimeExecutionReceipt({
      resolution,
      admission: input.admission,
      runtimeResult,
    });
    assert.equal(receipt.schemaVersion, 1);
    assert.equal(receipt.descriptorId, "runtime-a");
    assert.equal(receipt.runtimeId, "custom");
    assert.equal(receipt.outcome.status, "completed");
    assert.deepEqual(receipt.outcome.output, { nested: ["stable"] });
    assert.deepEqual(JSON.parse(JSON.stringify(receipt)), receipt);
    assert.equal(Object.isFrozen(receipt), true);
    assert.deepEqual(resolution, beforeResolution);
    assert.deepEqual(runtimeResult, beforeResult);
    output.nested.push("outside");
    assert.deepEqual(receipt.outcome.output, { nested: ["stable"] });
  });

  it("rejects inconsistent and non-JSON RuntimeResult values", () => {
    const input = simulatedInput();
    const resolution = resolvePolicyAwareDeclarativeRuntimeExecution(input);
    assert.equal(resolution.outcome, "resolved");
    if (resolution.outcome !== "resolved") return;
    const base = {
      runtimeId: "custom" as const,
      status: "completed" as const,
      startedAt: "2026-07-20T00:00:00.000Z",
      completedAt: "2026-07-20T00:00:00.000Z",
      diagnostics: [],
      output: null,
      metadata: {},
    };

    assert.throws(
      () =>
        createRuntimeExecutionReceipt({
          resolution,
          admission: input.admission,
          runtimeResult: { ...base, runtimeId: "codex" },
        }),
      /runtime_execution_receipt_inconsistent/,
    );
    assert.throws(
      () =>
        createRuntimeExecutionReceipt({
          resolution,
          admission: input.admission,
          runtimeResult: { ...base, output: new Map() },
        }),
      /runtime_execution_receipt_unserializable/,
    );
  });

  it("keeps policy denial distinct from adapter denial and receipt creation", async () => {
    const input = simulatedInput();
    const instrumented = SimulatedRuntime as {
      execute: typeof SimulatedRuntime.execute;
    };
    const originalExecute = instrumented.execute;
    let calls = 0;
    instrumented.execute = (request) => {
      calls += 1;
      return originalExecute(request);
    };

    try {
      const dryRun = dryRunPolicyAwareDeclarativeRuntimeExecution(input);
      assert.equal(dryRun.outcome, "planned");
      if (dryRun.outcome !== "planned") return;
      assert.equal(calls, 0);

      const success = await executePolicyAwareDeclarativeRuntimeWithReceipt(input);
      assert.equal(success.outcome, "executed");
      if (success.outcome !== "executed") return;
      assert.equal(calls, 1);
      assert.equal(success.receipt.descriptorId, dryRun.plan.descriptorId);
      assert.equal(success.receipt.runtimeId, dryRun.plan.runtimeId);
      assert.equal(success.receipt.outcome.status, success.runtimeResult.status);

      const policyDenied = await executePolicyAwareDeclarativeRuntimeWithReceipt({
        ...input,
        admission: {
          ...input.admission,
          policy: policyResolution({
            requirements: {
              ...policyResolution().requirements,
              allowedRuntimes: ["codex"],
            },
          }),
        },
      });
      assert.equal(policyDenied.outcome, "resolution_failed");
      assert.equal(policyDenied.receipt, null);
      assert.equal(calls, 1);

      const deniedAdapter = createSimulatedRuntimeAdapter({
        runtimeId: "custom",
        outcome: "failure",
      });
      instrumented.execute = (request) => {
        calls += 1;
        return deniedAdapter.execute(request);
      };
      const adapterDenied = await executePolicyAwareDeclarativeRuntimeWithReceipt(input);
      assert.equal(adapterDenied.outcome, "executed");
      if (adapterDenied.outcome !== "executed") return;
      assert.equal(calls, 2);
      assert.equal(adapterDenied.runtimeResult.status, "denied");
      assert.equal(adapterDenied.receipt.outcome.status, "denied");
      assert.equal(adapterDenied.receipt.outcome.errorCode, "runtime_disabled");
    } finally {
      instrumented.execute = originalExecute;
    }
  });

  it("creates no receipt or adapter call for missing mappings and unknown V10 runtimes", async () => {
    const instrumented = SimulatedRuntime as {
      execute: typeof SimulatedRuntime.execute;
    };
    const originalExecute = instrumented.execute;
    let calls = 0;
    instrumented.execute = (request) => {
      calls += 1;
      return originalExecute(request);
    };

    try {
      const mappingMissing = await executePolicyAwareDeclarativeRuntimeWithReceipt({
        ...simulatedInput(),
        runtimeMapping: {},
      });
      const unknownRuntime = await executePolicyAwareDeclarativeRuntimeWithReceipt({
        ...simulatedInput(),
        runtimeMapping: { "runtime-a": "chatgpt" },
      });

      assert.equal(mappingMissing.outcome, "resolution_failed");
      assert.equal(mappingMissing.receipt, null);
      assert.equal(unknownRuntime.outcome, "resolution_failed");
      assert.equal(unknownRuntime.receipt, null);
      assert.equal(calls, 0);
    } finally {
      instrumented.execute = originalExecute;
    }
  });
});
