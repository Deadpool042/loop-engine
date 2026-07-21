import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  executeLoopPolicyBoundLocalProcessWithEscalationEvaluation,
  prepareLoopPolicyBoundLocalProcessExecution,
  executeLoopPolicyBoundLocalProcessWithReceipt,
  projectLoopRuntimeEscalationResult,
  runLoopPlan,
  type LoopPolicyBoundLocalProcessDryRunResult,
  type LoopPolicyBoundLocalProcessExecutionResult,
  type ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationResult,
  type PolicyBoundLocalProcessBridgeInput,
} from "../../src/core/index.js";
import {
  executePolicyBoundLocalProcessWithReceipt,
  type PolicyBoundLocalProcessExecutionResult as RuntimePolicyBoundLocalProcessExecutionResult,
} from "../../src/core/runtime-execution-bridge.js";
import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { LoopRunResult } from "../../src/loop/types.js";
import type { RuntimeResult } from "../../src/runtime/types.js";

function fixtureProject(): ProjectConfig {
  return {
    name: "fixture-project",
    path: ".",
    type: "test",
    required_docs: [],
    validation: [],
    roadmap: ["roadmap.md"],
  };
}

function fixtureConfig(project: ProjectConfig): Config {
  return { projects: [project] };
}

function fixtureCandidate() {
  return {
    path: "roadmap.md",
    line: 3,
    text: "- [ ] Small safe micro-lot",
    kind: "safe" as const,
    reason: "no sensitive keyword detected",
    status: "todo" as const,
    priority: "default" as const,
  };
}

function fixtureSnapshot(project: ProjectConfig, candidate: ReturnType<typeof fixtureCandidate>) {
  return {
    project: { name: project.name, type: project.type, path: project.path },
    git: {
      branch: "main",
      clean: true,
      requiresGit: true,
      statusText: "",
      lastCommit: null,
    },
    docs: { required: [], missing: [] },
    validation: { commands: [], configured: false },
    roadmap: {
      available: true,
      paths: ["roadmap.md"],
      candidates: [candidate],
      selectedCandidate: candidate,
      stats: {
        total: 1,
        todo: 1,
        inProgress: 0,
        done: 0,
        unknown: 0,
        safe: 1,
        warning: 0,
        blocked: 0,
      },
      summary: { active: 1, done: 0, selectable: 1, hasBlocked: false },
    },
    health: "good" as const,
  };
}

function deterministicOptions() {
  let tick = 0;

  return {
    now: () => `2026-01-01T00:00:0${tick++}.000Z`,
    generateRunId: () => "run-fixed-id",
  };
}

function completedLoopResult(project: ProjectConfig): LoopRunResult {
  const candidate = fixtureCandidate();
  const contextBudget = {
    maxFiles: 1,
    maxCharacters: 100,
    maxEstimatedTokens: 25,
    includeFullFiles: false,
  };
  const profile = {
    id: "local.fixture",
    runtime: "custom" as const,
    provider: "local" as const,
    model: "fixture-model",
    effort: "low" as const,
    capabilities: ["shell_exec" as const],
    permissions: ["read_only", "shell_exec"] as const,
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: 1,
      maxRepairs: 0,
    },
  };

  return {
    schemaVersion: 1,
    runId: "run-fixed-id",
    project: project.name,
    mode: "execute",
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:00.000Z",
    candidate,
    steps: [],
    validation: null,
    modifiedFiles: [],
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: {
      policyId: "fixture-policy",
      mode: "execute",
      status: "resolved",
      requirements: {
        category: "code",
        mode: "execute",
        requiredCapabilities: ["shell_exec"],
        requiredPermissions: ["shell_exec"],
        minimumEffort: "low",
        maximumEffort: "low",
        contextBudget,
        executionBudget: {
          maxTokens: null,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: 1,
          maxRepairs: 0,
        },
        rationale: ["fixture"],
      },
      selectionRequest: {
        requiredCapabilities: ["shell_exec"],
        requiredPermissions: ["shell_exec"],
      },
      selection: { outcome: "selected", profile, rejected: [] },
      reasons: ["fixture"],
    },
    contextPackage: {
      project: project.name,
      budget: contextBudget,
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    },
  };
}

function bridgeInput(
  loopRunResult: LoopRunResult,
  root: string,
  overrides: Partial<PolicyBoundLocalProcessBridgeInput> = {},
): PolicyBoundLocalProcessBridgeInput {
  const defaultInput = {
    declarativeRequest: {
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
    },
    declarativeRegistry: {
      id: "runtime-registry",
      version: "v1",
      descriptors: [
        {
          id: "runtime-a",
          version: "v1",
          displayName: "Runtime A",
          lifecycleState: "eligible",
          capabilityReferences: ["runtime.code"],
        },
      ],
      compatibilityReferences: [],
    },
    runtimeCapabilities: [
      {
        id: "runtime.code",
        category: "execution",
        version: "v1",
        supportedFeatures: ["test", "edit"],
        declaredConstraints: ["local-only"],
        compatibilityReferences: [],
      },
    ],
    runtimeMapping: { "runtime-a": "local-process" as const },
    loopRunResult,
    runtimeRequestOptions: {
      allowedProviders: ["local" as const],
    },
    admission: {
      policy: {
        policyId: "fixture-policy",
        mode: "execute",
        status: "resolved",
        requirements: {
          category: "code",
          mode: "execute",
          requiredCapabilities: ["shell_exec"],
          requiredPermissions: ["shell_exec"],
          minimumEffort: "low",
          maximumEffort: "low",
          contextBudget: {
            maxFiles: 1,
            maxCharacters: 100,
            maxEstimatedTokens: 25,
            includeFullFiles: false,
          },
          executionBudget: {
            maxTokens: null,
            maxCostUsd: null,
            maxDurationMs: null,
            maxCalls: 1,
            maxRepairs: 0,
          },
          rationale: ["fixture"],
        },
        selectionRequest: {
          requiredCapabilities: ["shell_exec"],
          requiredPermissions: ["shell_exec"],
        },
        selection: {
          outcome: "selected",
          profile: {
            id: "local.fixture",
            runtime: "custom",
            provider: "local",
            model: "fixture-model",
            effort: "low",
            capabilities: ["shell_exec"],
            permissions: ["read_only", "shell_exec"],
            budget: {
              maxTokens: null,
              maxCostUsd: null,
              maxDurationMs: null,
              maxCalls: 1,
              maxRepairs: 0,
            },
          },
          rejected: [],
        },
        reasons: ["fixture"],
      },
      provider: "local",
      effort: "low",
      budget: { maxCalls: 1 },
    },
    localProcessBinding: {
      localProcess: {
        command: {
          executable: process.execPath,
          args: ["-e", "process.stdout.write('handoff')"],
          cwd: root,
          environment: { HandoffVisible: "yes" },
        },
        executionPolicy: {
          enabled: true,
          projectRoot: root,
          allowedExecutables: [process.execPath],
          allowedEnvironmentKeys: ["HandoffVisible"],
          timeoutMs: 2_000,
          maxStdoutBytes: 128,
          maxStderrBytes: 128,
        },
      },
    },
    ...overrides,
  } satisfies PolicyBoundLocalProcessBridgeInput;

  return defaultInput;
}

function loopOptions(
  plannedSteps: readonly string[] = ["Prepare context", "Prepare prompt"],
) {
  return {
    ...deterministicOptions(),
    loadConfig: () => fixtureConfig(fixtureProject()),
    planLoopCycle: () => {
      const project = fixtureProject();
      const candidate = fixtureCandidate();
      return {
        outcome: "ready" as const,
        candidate,
        plannedSteps: [...plannedSteps],
        snapshot: fixtureSnapshot(project, candidate),
      };
    },
  };
}

const escalationRegistry = Object.freeze({
  profiles: Object.freeze([
    {
      id: "agent-low",
      runtime: "custom",
      provider: "local",
      model: "fixture-model",
      effort: "low",
      capabilities: ["code_edit"],
      permissions: [],
      budget: {
        maxTokens: null,
        maxCostUsd: null,
        maxDurationMs: null,
        maxCalls: null,
        maxRepairs: null,
      },
    },
    {
      id: "agent-high",
      runtime: "custom",
      provider: "local",
      model: "fixture-model",
      effort: "high",
      capabilities: ["code_edit"],
      permissions: [],
      budget: {
        maxTokens: null,
        maxCostUsd: null,
        maxDurationMs: null,
        maxCalls: null,
        maxRepairs: null,
      },
    },
  ]),
});

const escalationRequest = Object.freeze({
  requiredCapabilities: Object.freeze(["code_edit"] as const),
  requiredPermissions: Object.freeze([] as const),
  minEffort: "low",
  maxEffort: "max",
});

function defaultEscalationInput(
  overrides: Partial<
    Parameters<typeof executeLoopPolicyBoundLocalProcessWithEscalationEvaluation>[2]
  > = {},
) {
  return Object.freeze({
    policy: {
      eligibleFailureKinds: Object.freeze(["timed_out"] as const),
    },
    registry: escalationRegistry,
    request: escalationRequest,
    previousProfileId: "agent-low",
    failureReason: "runtime_error",
    ...overrides,
  }) satisfies Parameters<
    typeof executeLoopPolicyBoundLocalProcessWithEscalationEvaluation
  >[2];
}

function noEligibleEscalationPolicy() {
  return Object.freeze({
    eligibleFailureKinds: Object.freeze([] as const),
  });
}

function runtimeResult(status: RuntimeResult["status"]): RuntimeResult {
  return {
    runtimeId: "codex",
    status,
    startedAt: "2026-07-21T00:00:00.000Z",
    completedAt: "2026-07-21T00:00:01.000Z",
    diagnostics: [],
    output: null,
    metadata: {},
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
  };
}

function executionResult(
  runtimeResultValue: RuntimeResult | null,
  receiptText = "receipt-secret",
): RuntimePolicyBoundLocalProcessExecutionResult {
  return {
    outcome: runtimeResultValue === null ? "resolution_failed" : "executed",
    resolution: {},
    runtimeResult: runtimeResultValue,
    receipt:
      runtimeResultValue === null
        ? null
        : {
            schemaVersion: 1,
            receiptOutput: receiptText,
            runtimeResult: {
              ...runtimeResultValue,
              stdout: receiptText,
              stderr: "receipt stderr",
              output: {
                exitCode: 0,
                stdout: receiptText,
                stderr: "receipt stderr",
              },
            },
          },
    diagnostics: [],
  } as unknown as RuntimePolicyBoundLocalProcessExecutionResult;
}

function redactedExecutionResult(
  runtimeResultValue: RuntimeResult | null,
): RuntimePolicyBoundLocalProcessExecutionResult {
  return {
    outcome: runtimeResultValue === null ? "resolution_failed" : "executed",
    resolution: {},
    runtimeResult: runtimeResultValue,
    receipt:
      runtimeResultValue === null
        ? null
        : {
            schemaVersion: 1,
            descriptorId: "descriptor-runtime-a",
            runtimeId: "local-process",
            proof: {
              commandId: "local-process",
              policyId: "fixture-policy",
              details: {
                kind: "ok",
              },
            },
            statusInfo: {
              status: runtimeResultValue.status,
              reason: "redacted",
              notes: [],
            },
          },
    diagnostics: [],
  } as unknown as RuntimePolicyBoundLocalProcessExecutionResult;
}

describe("prepareLoopPolicyBoundLocalProcessExecution", () => {
  it("returns the historical loop result and a separate successful runtime dry-run result", () => {
    const project = fixtureProject();
    const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-handoff-")));
    const expectedOptions = {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => {
        const candidate = fixtureCandidate();
        return {
          outcome: "ready" as const,
          candidate,
          plannedSteps: ["Prepare context", "Prepare prompt"],
          snapshot: fixtureSnapshot(project, candidate),
        };
      },
    };
    const preparedOptions = {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => {
        const candidate = fixtureCandidate();
        return {
          outcome: "ready" as const,
          candidate,
          plannedSteps: ["Prepare context", "Prepare prompt"],
          snapshot: fixtureSnapshot(project, candidate),
        };
      },
    };

    try {
      const expectedLoop = runLoopPlan(project.name, expectedOptions);
      const original = bridgeInput(expectedLoop, root);
      const before = structuredClone(original);
      const prepared: LoopPolicyBoundLocalProcessDryRunResult =
        prepareLoopPolicyBoundLocalProcessExecution(
          project.name,
          original,
          preparedOptions,
        );

      assert.deepEqual(prepared.loopRunResult, expectedLoop);
      assert.equal(prepared.runtimeDryRunResult.outcome, "planned");
      if (prepared.runtimeDryRunResult.outcome !== "planned") return;
      assert.equal(
        prepared.runtimeDryRunResult.plan.request.localProcessConfigured,
        true,
      );
      assert.deepEqual(
        prepared.runtimeDryRunResult.resolution.runtimeRequest.localProcess,
        original.localProcessBinding?.localProcess,
      );
      assert.equal(JSON.stringify(prepared.runtimeDryRunResult.plan).includes("receipt-secret"), false);
      assert.deepEqual(original, before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps runtime denials and binding errors isolated from the loop result", () => {
    const project = fixtureProject();
    const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-handoff-deny-")));
    const expectedOptions = {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => {
        const candidate = fixtureCandidate();
        return {
          outcome: "ready" as const,
          candidate,
          plannedSteps: [],
          snapshot: fixtureSnapshot(project, candidate),
        };
      },
    };
    const preparedOptions = {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => {
        const candidate = fixtureCandidate();
        return {
          outcome: "ready" as const,
          candidate,
          plannedSteps: [],
          snapshot: fixtureSnapshot(project, candidate),
        };
      },
    };

    try {
      const expectedLoop = runLoopPlan(project.name, expectedOptions);
      const denied = prepareLoopPolicyBoundLocalProcessExecution(
        project.name,
        bridgeInput(expectedLoop, root, {
          admission: {
            policy: {
              policyId: "fixture-policy",
              mode: "execute",
              status: "resolved",
              requirements: {
                category: "code",
                mode: "execute",
                requiredCapabilities: ["shell_exec"],
                requiredPermissions: ["shell_exec"],
                minimumEffort: "low",
                maximumEffort: "low",
                contextBudget: {
                  maxFiles: 1,
                  maxCharacters: 100,
                  maxEstimatedTokens: 25,
                  includeFullFiles: false,
                },
                executionBudget: {
                  maxTokens: null,
                  maxCostUsd: null,
                  maxDurationMs: null,
                  maxCalls: 1,
                  maxRepairs: 0,
                },
                rationale: ["fixture"],
              },
              selectionRequest: {
                requiredCapabilities: ["shell_exec"],
                requiredPermissions: ["shell_exec"],
              },
              selection: {
                outcome: "selected",
                profile: {
                  id: "local.fixture",
                  runtime: "custom",
                  provider: "local",
                  model: "fixture-model",
                  effort: "low",
                  capabilities: ["shell_exec"],
                  permissions: ["read_only", "shell_exec"],
                  budget: {
                    maxTokens: null,
                    maxCostUsd: null,
                    maxDurationMs: null,
                    maxCalls: 1,
                    maxRepairs: 0,
                  },
                },
                rejected: [],
              },
              reasons: ["fixture"],
            },
            provider: "local",
            effort: "low",
            budget: { maxCalls: 1 },
          },
        }),
        preparedOptions,
      );

      assert.deepEqual(denied.loopRunResult, expectedLoop);
      assert.equal(denied.runtimeDryRunResult.outcome, "planned");
      if (denied.runtimeDryRunResult.outcome !== "planned") return;

      const invalidBinding = prepareLoopPolicyBoundLocalProcessExecution(
        project.name,
        bridgeInput(expectedLoop, root, {
          runtimeMapping: { "runtime-a": "codex" },
        }),
        preparedOptions,
      );

      assert.equal(invalidBinding.runtimeDryRunResult.outcome, "unavailable_v10_request");

      const missingBinding = prepareLoopPolicyBoundLocalProcessExecution(
        project.name,
        bridgeInput(expectedLoop, root, {
          localProcessBinding: undefined,
        }),
        preparedOptions,
      );

      assert.equal(missingBinding.runtimeDryRunResult.outcome, "unavailable_v10_request");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("executeLoopPolicyBoundLocalProcessWithReceipt", () => {
  it("runs the historical loop plan and the local-process execution without transforming the runtime result", async () => {
    const project = fixtureProject();
    const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-handoff-exec-")));
    const expectedOptions = {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => {
        const candidate = fixtureCandidate();
        return {
          outcome: "ready" as const,
          candidate,
          plannedSteps: ["Prepare context", "Prepare prompt"],
          snapshot: fixtureSnapshot(project, candidate),
        };
      },
    };
    const executionOptions = {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => {
        const candidate = fixtureCandidate();
        return {
          outcome: "ready" as const,
          candidate,
          plannedSteps: ["Prepare context", "Prepare prompt"],
          snapshot: fixtureSnapshot(project, candidate),
        };
      },
    };

    try {
      const expectedLoop = runLoopPlan(project.name, expectedOptions);
      const original = bridgeInput(expectedLoop, root);
      const before = structuredClone(original);
      let calls = 0;
      let forwardedInput: PolicyBoundLocalProcessBridgeInput | null = null;
      let forwardedRuntimeResult: RuntimePolicyBoundLocalProcessExecutionResult | null = null;

      const executed: LoopPolicyBoundLocalProcessExecutionResult = await executeLoopPolicyBoundLocalProcessWithReceipt(
        project.name,
        original,
        {
          ...executionOptions,
          executePolicyBoundLocalProcessWithReceipt: async (input) => {
            calls += 1;
            forwardedInput = input;
            forwardedRuntimeResult =
              await executePolicyBoundLocalProcessWithReceipt(input);
            return forwardedRuntimeResult;
          },
        },
      );

      assert.equal(calls, 1);
      assert.deepEqual(executed.loopRunResult, expectedLoop);
      assert.strictEqual(executed.runtimeExecutionResult, forwardedRuntimeResult);
      assert.deepEqual(forwardedInput?.loopRunResult, expectedLoop);
      assert.strictEqual(forwardedInput?.localProcessBinding, original.localProcessBinding);
      assert.equal(executed.runtimeExecutionResult.outcome, "executed");
      if (executed.runtimeExecutionResult.outcome !== "executed") return;
      assert.notEqual(executed.runtimeExecutionResult.runtimeResult.output, null);
      assert.equal(
        executed.runtimeExecutionResult.receipt.outcome.output,
        null,
      );
      assert.equal(
        JSON.stringify(executed.runtimeExecutionResult.receipt).includes(
          "receipt-secret",
        ),
        false,
      );
      assert.equal(
        JSON.stringify(executed.runtimeExecutionResult.receipt).includes(
          process.execPath,
        ),
        false,
      );
      assert.deepEqual(original, before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps policy refusal and invalid binding from starting a process", async () => {
    const project = fixtureProject();
    const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-handoff-deny-exec-")));
    const executionOptions = {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => {
        const candidate = fixtureCandidate();
        return {
          outcome: "ready" as const,
          candidate,
          plannedSteps: [],
          snapshot: fixtureSnapshot(project, candidate),
        };
      },
    };

    try {
      const expectedLoop = runLoopPlan(project.name, executionOptions);
      const denied = await executeLoopPolicyBoundLocalProcessWithReceipt(
        project.name,
        bridgeInput(expectedLoop, root, {
          runtimeRequestOptions: {
            allowedProviders: ["openai" as const],
          },
          admission: {
            policy: {
              policyId: "fixture-policy",
              mode: "execute",
              status: "resolved",
              requirements: {
                category: "code",
                mode: "execute",
                requiredCapabilities: ["shell_exec"],
                requiredPermissions: ["shell_exec"],
                minimumEffort: "low",
                maximumEffort: "low",
                contextBudget: {
                  maxFiles: 1,
                  maxCharacters: 100,
                  maxEstimatedTokens: 25,
                  includeFullFiles: false,
                },
                executionBudget: {
                  maxTokens: null,
                  maxCostUsd: null,
                  maxDurationMs: null,
                  maxCalls: 1,
                  maxRepairs: 0,
                },
                rationale: ["fixture"],
              },
              selectionRequest: {
                requiredCapabilities: ["shell_exec"],
                requiredPermissions: ["shell_exec"],
              },
              selection: {
                outcome: "selected",
                profile: {
                  id: "local.fixture",
                  runtime: "custom",
                  provider: "local",
                  model: "fixture-model",
                  effort: "low",
                  capabilities: ["shell_exec"],
                  permissions: ["read_only", "shell_exec"],
                  budget: {
                    maxTokens: null,
                    maxCostUsd: null,
                    maxDurationMs: null,
                    maxCalls: 1,
                    maxRepairs: 0,
                  },
                },
                rejected: [],
              },
              reasons: ["fixture"],
            },
            provider: "local",
            effort: "low",
            budget: { maxCalls: 1 },
          },
        }),
        executionOptions,
      );

      assert.equal(denied.runtimeExecutionResult.outcome, "resolution_failed");
      assert.equal(denied.runtimeExecutionResult.runtimeResult, null);
      assert.equal(denied.runtimeExecutionResult.receipt, null);

      const invalidBinding = await executeLoopPolicyBoundLocalProcessWithReceipt(
        project.name,
        bridgeInput(expectedLoop, root, {
          runtimeMapping: {},
        }),
        executionOptions,
      );

      assert.equal(
        invalidBinding.runtimeExecutionResult.outcome,
        "resolution_failed",
      );
      assert.equal(invalidBinding.runtimeExecutionResult.runtimeResult, null);
      assert.equal(invalidBinding.runtimeExecutionResult.receipt, null);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("executeLoopPolicyBoundLocalProcessWithEscalationEvaluation", () => {
  const eligiblePolicy = Object.freeze({
    eligibleFailureKinds: Object.freeze(["timed_out"] as const),
  });
  const ineligiblePolicy = Object.freeze({
    eligibleFailureKinds: Object.freeze([] as const),
  });
  function buildEscalationInput(
    overrides: Partial<
      Parameters<typeof executeLoopPolicyBoundLocalProcessWithEscalationEvaluation>[2]
    > = {},
  ) {
    return defaultEscalationInput({
      policy: eligiblePolicy,
      ...overrides,
    });
  }

  it("returns the loop result, runtime execution result, and a pure escalation evaluation for a successful execution", async () => {
    const project = fixtureProject();
    const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-handoff-escalation-")));
    const expectedOptions = loopOptions();
    const executionOptions = loopOptions();

    try {
      const expectedLoop = runLoopPlan(project.name, expectedOptions);
      const original = bridgeInput(expectedLoop, root);
      const before = structuredClone(original);
      let calls = 0;
      const runtimeExecution = executionResult(runtimeResult("completed"));

      const result: ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationResult =
        await executeLoopPolicyBoundLocalProcessWithEscalationEvaluation(
          project.name,
          original,
          buildEscalationInput(),
          {
            ...executionOptions,
            executePolicyBoundLocalProcessWithReceipt: async () => {
              calls += 1;
              return runtimeExecution;
            },
          },
        );

      assert.equal(calls, 1);
      assert.deepEqual(result.loopRunResult, expectedLoop);
      assert.strictEqual(result.runtimeExecutionResult, runtimeExecution);
      assert.deepEqual(result.escalationEvaluation, {
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
        agentRequest: null,
        agentEscalationResult: null,
      });
      assert.equal(
        JSON.stringify(result.runtimeExecutionResult.receipt).includes(
          "receipt-secret",
        ),
        true,
      );
      assert.equal(
        JSON.stringify(result.escalationEvaluation).includes("receipt-secret"),
        false,
      );
      assert.deepEqual(original, before);
      assert.ok(Object.isFrozen(result));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("propagates eligible and ineligible failures without executing Agent code", async () => {
    const project = fixtureProject();
    const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-handoff-escalation-failure-")));
    const expectedOptions = loopOptions([]);
    const executionOptions = loopOptions([]);

    try {
      const expectedLoop = runLoopPlan(project.name, expectedOptions);
      let calls = 0;
      const eligible = await executeLoopPolicyBoundLocalProcessWithEscalationEvaluation(
        project.name,
        bridgeInput(expectedLoop, root),
        buildEscalationInput(),
        {
          ...executionOptions,
          executePolicyBoundLocalProcessWithReceipt: async () => {
            calls += 1;
            return executionResult(runtimeResult("timed_out"));
          },
        },
      );

      assert.equal(calls, 1);
      assert.equal(eligible.escalationEvaluation.decision.action, "escalate");
      assert.deepEqual(eligible.escalationEvaluation.agentRequest, {
        registry: escalationRegistry,
        request: escalationRequest,
        previousProfileId: "agent-low",
        failureReason: "runtime_error",
      });
      assert.deepEqual(eligible.escalationEvaluation.agentEscalationResult, {
        outcome: "escalated",
        profile: escalationRegistry.profiles[1],
        rejected: [
          {
            profileId: "agent-low",
            reason: "excluded: this is the profile that just failed",
          },
        ],
      });

      const ineligible = await executeLoopPolicyBoundLocalProcessWithEscalationEvaluation(
        project.name,
        bridgeInput(expectedLoop, root),
        Object.freeze({
          ...buildEscalationInput(),
          policy: ineligiblePolicy,
        }),
        {
          ...executionOptions,
          executePolicyBoundLocalProcessWithReceipt: async () =>
            executionResult(runtimeResult("non_zero_exit")),
        },
      );

      assert.deepEqual(ineligible.escalationEvaluation, {
        outcome: {
          outcome: "failed",
          runtimeStatus: "non_zero_exit",
        },
        failure: {
          kind: "process_failed",
          runtimeStatus: "non_zero_exit",
        },
        decision: {
          action: "none",
          reason: "failure_not_eligible",
          failureKind: "process_failed",
          runtimeStatus: "non_zero_exit",
        },
        agentRequest: null,
        agentEscalationResult: null,
      });
      assert.equal(
        JSON.stringify(ineligible.escalationEvaluation).includes(
          "receipt-secret",
        ),
        false,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves the historical receipt-only path when execution is refused before spawn", async () => {
    const project = fixtureProject();
    const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-handoff-escalation-denied-")));
    const expectedOptions = loopOptions([]);
    const executionOptions = loopOptions([]);

    try {
      const expectedLoop = runLoopPlan(project.name, expectedOptions);
      let calls = 0;
      const denied = await executeLoopPolicyBoundLocalProcessWithEscalationEvaluation(
        project.name,
        bridgeInput(expectedLoop, root, {
          runtimeRequestOptions: {
            allowedProviders: ["openai" as const],
          },
        }),
        Object.freeze({
          ...buildEscalationInput(),
          policy: ineligiblePolicy,
        }),
        {
          ...executionOptions,
          executePolicyBoundLocalProcessWithReceipt: async (input) => {
            calls += 1;
            return executePolicyBoundLocalProcessWithReceipt(input);
          },
        },
      );

      assert.equal(calls, 1);
      assert.equal(denied.runtimeExecutionResult.outcome, "resolution_failed");
      assert.equal(denied.runtimeExecutionResult.runtimeResult, null);
      assert.equal(denied.runtimeExecutionResult.receipt, null);
      assert.equal(denied.escalationEvaluation.agentRequest, null);
      assert.equal(denied.escalationEvaluation.agentEscalationResult, null);
      assert.deepEqual(denied.loopRunResult, expectedLoop);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("projectLoopRuntimeEscalationResult", () => {
  const singleProfileRegistry = Object.freeze({
    profiles: Object.freeze([
      {
        id: "agent-low",
        runtime: "custom",
        provider: "local",
        model: "fixture-model",
        effort: "low",
        capabilities: ["code_edit"],
        permissions: [],
        budget: {
          maxTokens: null,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: null,
          maxRepairs: null,
        },
      },
    ]),
  });

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

  it("projects a successful runtime without escalation into a redacted public shape", async () => {
    const project = fixtureProject();
    const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-projection-success-")));
    const options = loopOptions();

    try {
      const loopRunResult = runLoopPlan(project.name, options);
      const result = await executeLoopPolicyBoundLocalProcessWithEscalationEvaluation(
        project.name,
        bridgeInput(loopRunResult, root),
        defaultEscalationInput(),
        {
          ...options,
          executePolicyBoundLocalProcessWithReceipt: async () =>
            redactedExecutionResult(runtimeResult("completed")),
        },
      );

      const projected = projectLoopRuntimeEscalationResult(result);
      const before = structuredClone(projected);

      assert.strictEqual(projected.loopRunResult, result.loopRunResult);
      assert.deepEqual(projected, {
        schemaVersion: 1,
        loopRunResult: result.loopRunResult,
        runtime: {
          outcome: "executed",
          runtimeStatus: "completed",
          receipt: result.runtimeExecutionResult.receipt,
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
      });
      assert.strictEqual(projected.runtime.receipt, result.runtimeExecutionResult.receipt);
      assertForbiddenKeys(projected.runtime, "root.runtime");
      assertForbiddenKeys(projected.escalation, "root.escalation");
      assert.equal(JSON.stringify(projected).includes("receipt-secret"), false);
      assert.equal(
        JSON.stringify(projected).startsWith('{"schemaVersion":1,'),
        true,
      );
      assert.deepEqual(projected, before);
      assert.ok(Object.isFrozen(projected));
      assert.ok(Object.isFrozen(projected.runtime));
      assert.ok(Object.isFrozen(projected.escalation));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("projects selected and unselected escalations deterministically", async () => {
    const project = fixtureProject();
    const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-projection-escalation-")));
    const options = loopOptions([]);

    try {
      const loopRunResult = runLoopPlan(project.name, options);
      const selected = await executeLoopPolicyBoundLocalProcessWithEscalationEvaluation(
        project.name,
        bridgeInput(loopRunResult, root),
        defaultEscalationInput(),
        {
          ...options,
          executePolicyBoundLocalProcessWithReceipt: async () =>
            redactedExecutionResult(runtimeResult("timed_out")),
        },
      );
      const projectedSelected = projectLoopRuntimeEscalationResult(selected);

      assert.equal(projectedSelected.escalation.selectedProfileId, "agent-high");
      assert.equal(projectedSelected.schemaVersion, 1);
      assertForbiddenKeys(projectedSelected.runtime, "root.runtime");
      assertForbiddenKeys(projectedSelected.escalation, "root.escalation");

      const unselected = await executeLoopPolicyBoundLocalProcessWithEscalationEvaluation(
        project.name,
        bridgeInput(loopRunResult, root),
        defaultEscalationInput({
          registry: singleProfileRegistry,
        }),
        {
          ...options,
          executePolicyBoundLocalProcessWithReceipt: async () =>
            redactedExecutionResult(runtimeResult("timed_out")),
        },
      );
      const projectedUnselected = projectLoopRuntimeEscalationResult(unselected);

      assert.equal(projectedUnselected.escalation.selectedProfileId, null);
      assert.equal(projectedUnselected.schemaVersion, 1);
      assertForbiddenKeys(projectedUnselected.runtime, "root.runtime");
      assertForbiddenKeys(projectedUnselected.escalation, "root.escalation");
      assert.equal(
        JSON.stringify(projectedSelected),
        JSON.stringify(projectLoopRuntimeEscalationResult(selected)),
      );
      assert.equal(
        JSON.stringify(projectedUnselected),
        JSON.stringify(projectLoopRuntimeEscalationResult(unselected)),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps runtime absent redacted and remains immutable", async () => {
    const project = fixtureProject();
    const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-projection-absent-")));
    const options = loopOptions([]);

    try {
      const loopRunResult = runLoopPlan(project.name, options);
      const result = await executeLoopPolicyBoundLocalProcessWithEscalationEvaluation(
        project.name,
        bridgeInput(loopRunResult, root),
        defaultEscalationInput({
          policy: noEligibleEscalationPolicy(),
        }),
        {
          ...options,
          executePolicyBoundLocalProcessWithReceipt: async () =>
            executionResult(null),
        },
      );
      const projected = projectLoopRuntimeEscalationResult(result);

      assert.equal(projected.schemaVersion, 1);
      assert.equal(projected.runtime.runtimeStatus, null);
      assert.equal(projected.runtime.receipt, null);
      assert.equal(projected.escalation.selectedProfileId, null);
      assertForbiddenKeys(projected.runtime, "root.runtime");
      assertForbiddenKeys(projected.escalation, "root.escalation");
      assert.equal(JSON.stringify(projected).includes("runtimeResult"), false);
      assert.deepEqual(projected, projectLoopRuntimeEscalationResult(result));
      assert.ok(Object.isFrozen(projected));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
