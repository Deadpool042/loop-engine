import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLoopExecutionPlan } from "../../src/loop/execution-plan.js";
import type { LoopExecutorInput } from "../../src/loop/execution.js";

function admittedInput(): LoopExecutorInput {
  return {
    runId: "run-1",
    project: {
      name: "loop-engine",
      path: ".",
      docs: [],
      roadmap: [],
      validation: ["pnpm run ci"],
    },
    candidate: {
      text: "Implement execution planning",
      kind: "feature",
      status: "todo",
      path: "docs/roadmap/loop-engine.md",
      line: 1,
    },
    contextPackage: {
      files: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
      rationale: [],
    },
    agentPolicy: {
      policyId: "default",
      mode: "execute",
      status: "resolved",
      requirements: {
        category: "code",
        mode: "execute",
        requiredCapabilities: ["code_edit", "shell_exec", "test_execution"],
        requiredPermissions: ["read_only", "write_worktree", "shell_exec"],
        minimumEffort: "medium",
        maximumEffort: "high",
        contextBudget: {
          maxFiles: 10,
          maxCharacters: 10000,
          maxEstimatedTokens: 2500,
          includeFullFiles: false,
        },
        executionBudget: {
          maxTokens: 150000,
          maxCostUsd: 4,
          maxDurationMs: 300000,
          maxCalls: 1,
          maxRepairs: 1,
        },
        rationale: ["category=code"],
      },
      selectionRequest: {
        requiredCapabilities: ["code_edit", "shell_exec", "test_execution"],
        requiredPermissions: ["read_only", "write_worktree", "shell_exec"],
      },
      selection: {
        outcome: "selected",
        profile: {
          id: "configured.codex",
          runtime: "codex",
          provider: "openai",
          model: "gpt-5.6-sol",
          effort: "medium",
          capabilities: ["code_edit", "shell_exec", "test_execution"],
          permissions: ["read_only", "write_worktree", "shell_exec"],
          budget: {
            maxTokens: 150000,
            maxCostUsd: 4,
            maxDurationMs: 300000,
            maxCalls: 1,
            maxRepairs: 1,
          },
        },
        rejected: [],
      },
      reasons: ["selected configured.codex"],
    },
  } as unknown as LoopExecutorInput;
}

describe("createLoopExecutionPlan", () => {
  it("captures the admitted provider decision immutably", () => {
    const plan = createLoopExecutionPlan(admittedInput());

    assert.equal(plan.schemaVersion, 1);
    assert.equal(plan.provider, "openai");
    assert.equal(plan.runtime, "codex");
    assert.equal(plan.profileId, "configured.codex");
    assert.equal(plan.model, "gpt-5.6-sol");
    assert.equal(plan.policy.status, "resolved");
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.budget), true);
    assert.equal(Object.isFrozen(plan.policy), true);
    assert.deepEqual(JSON.parse(JSON.stringify(plan)).provider, "openai");
  });

  it("rejects a request without an admitted selected policy", () => {
    const input = admittedInput();
    const rejected = {
      ...input,
      agentPolicy: { ...input.agentPolicy, status: "policy_disabled", selection: null },
    } as unknown as LoopExecutorInput;

    assert.throws(
      () => createLoopExecutionPlan(rejected),
      /requires a resolved selected agent policy/,
    );
  });
});
