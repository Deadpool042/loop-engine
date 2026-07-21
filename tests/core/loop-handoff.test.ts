import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  prepareLoopPolicyBoundLocalProcessExecution,
  executeLoopPolicyBoundLocalProcessWithReceipt,
  runLoopPlan,
  type LoopPolicyBoundLocalProcessDryRunResult,
  type LoopPolicyBoundLocalProcessExecutionResult,
  type PolicyBoundLocalProcessBridgeInput,
} from "../../src/core/index.js";
import {
  executePolicyBoundLocalProcessWithReceipt,
  type PolicyBoundLocalProcessExecutionResult as RuntimePolicyBoundLocalProcessExecutionResult,
} from "../../src/core/runtime-execution-bridge.js";
import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { LoopRunResult } from "../../src/loop/types.js";

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
