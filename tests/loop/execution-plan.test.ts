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
          id: "configured.claude_code",
          runtime: "claude_code",
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          effort: "low",
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
      reasons: ["selected configured.claude_code"],
    },
  } as unknown as LoopExecutorInput;
}

describe("createLoopExecutionPlan", () => {
  it("captures the provider while resolving effort from policy requirements", () => {
    const plan = createLoopExecutionPlan(admittedInput());

    assert.equal(plan.schemaVersion, 1);
    assert.equal(plan.provider, "anthropic");
    assert.equal(plan.runtime, "claude_code");
    assert.equal(plan.profileId, "configured.claude_code");
    assert.equal(plan.model, "claude-sonnet-4-5");
    assert.equal(plan.effort, "medium");
    assert.equal(plan.policy.status, "resolved");
    assert.equal(Object.isFrozen(plan), true);
    assert.equal(Object.isFrozen(plan.budget), true);
    assert.equal(Object.isFrozen(plan.policy), true);
  });

  it("carries only the project's logical name, never its physical path or full configuration", () => {
    const plan = createLoopExecutionPlan(admittedInput());

    assert.deepEqual(plan.project, { name: "loop-engine" });
    assert.equal(Object.isFrozen(plan.project), true);
    assert.equal(
      (plan.project as Readonly<Record<string, unknown>>).path,
      undefined,
    );

    const inputWithDifferentPath = {
      ...admittedInput(),
      project: { name: "loop-engine", path: "/some/other/host/checkout" },
    } as unknown as LoopExecutorInput;
    const planFromDifferentPath = createLoopExecutionPlan(
      inputWithDifferentPath,
    );

    assert.deepEqual(planFromDifferentPath.project, plan.project);
  });

  it("carries only explicit forbidden content terms in the immutable plan", () => {
    const plan = createLoopExecutionPlan({
      ...admittedInput(),
      brief: {
        objective: "Write a neutral standard.",
        deliverables: ["docs/standard.md"],
        outOfScope: ["Configuration"],
        forbiddenContentTerms: ["logrotate", "Docker"],
      },
    });

    assert.deepEqual(plan.brief?.forbiddenContentTerms, [
      "logrotate",
      "Docker",
    ]);
    assert.equal(Object.isFrozen(plan.brief?.forbiddenContentTerms), true);
  });

  it("rejects a request without an admitted selected policy", () => {
    const input = admittedInput();
    const rejected = {
      ...input,
      agentPolicy: {
        ...input.agentPolicy,
        status: "policy_disabled",
        selection: null,
      },
    } as unknown as LoopExecutorInput;

    assert.throws(
      () => createLoopExecutionPlan(rejected),
      /requires a resolved selected agent policy/,
    );
  });
});
