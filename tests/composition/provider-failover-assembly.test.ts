import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import type { AgentProfile } from "../../src/agents/types.js";
import {
  createFallbackExecutionPlan,
  createLoopProviderFailoverAssembly,
} from "../../src/composition/provider-failover-assembly.js";
import type { LoopProviderAssembly } from "../../src/composition/provider-registry.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";
import type { LoopExecutor } from "../../src/loop/execution.js";

function profile(
  id: string,
  provider: "openai" | "anthropic",
  runtime: "codex" | "claude_code",
  maxCalls: number,
): AgentProfile {
  return Object.freeze({
    id,
    provider,
    runtime,
    model: `${id}-model`,
    effort: "medium",
    capabilities: Object.freeze(["code_edit", "test_execution"]),
    permissions: Object.freeze(["write_worktree", "shell_exec"]),
    budget: Object.freeze({
      maxTokens: 10_000,
      maxCostUsd: 2,
      maxDurationMs: 60_000,
      maxCalls,
      maxRepairs: 1,
    }),
  });
}

function plan(selected: AgentProfile): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-multi-provider-1",
    project: Object.freeze({ name: "loop-engine" }),
    candidate: Object.freeze({
      path: "ROADMAP.md",
      line: 1,
      text: "Implement provider failover",
      kind: "task",
      reason: "pending",
      status: "pending",
      priority: "medium",
    }),
    contextPackage: Object.freeze({
      files: Object.freeze([]),
      estimatedTokens: 0,
      truncated: false,
    }),
    provider: selected.provider,
    runtime: selected.runtime,
    profileId: selected.id,
    model: selected.model,
    effort: selected.effort,
    budget: selected.budget,
    policy: Object.freeze({
      id: "execute-policy",
      mode: "execute",
      status: "resolved",
      requiredCapabilities: Object.freeze(["code_edit", "test_execution"]),
      requiredPermissions: Object.freeze(["write_worktree", "shell_exec"]),
      rationale: Object.freeze(["selected smallest capable provider"]),
    }),
  }) as LoopExecutionPlan;
}

function assembly(
  id: "codex" | "claude",
  selected: AgentProfile,
  executor: LoopExecutor,
): LoopProviderAssembly {
  return Object.freeze({
    id: id as LoopProviderAssembly["id"],
    agentRegistry: createAgentRegistry([selected]),
    executor,
  });
}

const completed =
  (file: string): LoopExecutor =>
  async () =>
    Object.freeze({
      status: "completed" as const,
      modifiedFiles: Object.freeze([file]),
      details: Object.freeze(["completed"]),
    });

const failed =
  (code: string): LoopExecutor =>
  async () =>
    Object.freeze({
      status: "failed" as const,
      modifiedFiles: Object.freeze([]),
      failure: Object.freeze({
        code,
        message: code,
        details: Object.freeze([]),
      }),
    });

test("admits a provider-specific fallback plan without widening budget", () => {
  const primary = profile("configured.codex", "openai", "codex", 2);
  const fallback = profile("configured.claude", "anthropic", "claude_code", 5);
  const fallbackPlan = createFallbackExecutionPlan(plan(primary), fallback);

  assert.equal(fallbackPlan.provider, "anthropic");
  assert.equal(fallbackPlan.runtime, "claude_code");
  assert.equal(fallbackPlan.profileId, "configured.claude");
  assert.equal(fallbackPlan.budget.maxCalls, 2);
  assert.equal(
    fallbackPlan.policy.rationale.at(-1),
    "Fallback admitted through profile configured.claude.",
  );
});

test("executes the configured fallback through one application executor", async () => {
  const primary = profile("configured.codex", "openai", "codex", 2);
  const fallback = profile("configured.claude", "anthropic", "claude_code", 2);
  const dependency = createLoopProviderFailoverAssembly(
    [
      assembly("codex", primary, failed("provider_timeout")),
      assembly("claude", fallback, completed("src/fallback.ts")),
    ],
    2,
  );

  const result = await dependency.executor(plan(primary));
  assert.equal(result.status, "completed");
  assert.deepEqual(result.modifiedFiles, ["src/fallback.ts"]);
  assert.deepEqual(dependency.providerIds, ["codex", "claude"]);
  assert.equal(dependency.maxAttempts, 2);
  assert.equal(dependency.agentRegistry.profiles.length, 2);
});

test("skips explicitly unavailable fallback profiles", async () => {
  const primary = profile("configured.codex", "openai", "codex", 2);
  const unavailable = Object.freeze({
    ...profile(
      "configured.claude.economy",
      "anthropic",
      "claude_code",
      2,
    ),
    availability: "unavailable" as const,
  });
  const available = Object.freeze({
    ...profile(
      "configured.claude.standard",
      "anthropic",
      "claude_code",
      2,
    ),
    availability: "available" as const,
  });
  let observedProfileId: string | null = null;
  const fallbackExecutor: LoopExecutor = async (fallbackPlan) => {
    observedProfileId = fallbackPlan.profileId;
    return completed("src/fallback.ts")(fallbackPlan);
  };
  const dependency = createLoopProviderFailoverAssembly(
    [
      assembly("codex", primary, failed("provider_timeout")),
      Object.freeze({
        id: "claude_code",
        agentRegistry: createAgentRegistry([unavailable, available]),
        executor: fallbackExecutor,
      }),
    ],
    2,
  );

  const result = await dependency.executor(plan(primary));
  assert.equal(result.status, "completed");
  assert.equal(observedProfileId, "configured.claude.standard");
});

test("skips fallback profiles that cannot satisfy admitted permissions", async () => {
  const primary = profile("configured.codex", "openai", "codex", 2);
  const incompatible = Object.freeze({
    ...profile("configured.claude", "anthropic", "claude_code", 2),
    permissions: Object.freeze(["read_only"] as const),
  });
  let fallbackCalls = 0;
  const fallbackExecutor: LoopExecutor = async () => {
    fallbackCalls += 1;
    return completed("never.ts")(plan(primary));
  };
  const dependency = createLoopProviderFailoverAssembly(
    [
      assembly("codex", primary, failed("provider_timeout")),
      assembly("claude", incompatible, fallbackExecutor),
    ],
    2,
  );

  const result = await dependency.executor(plan(primary));
  assert.equal(result.status, "failed");
  assert.equal(fallbackCalls, 0);
});

test("rejects duplicate provider assembly ids before execution", () => {
  const primary = profile("configured.codex", "openai", "codex", 2);
  assert.throws(
    () =>
      createLoopProviderFailoverAssembly(
        [
          assembly("codex", primary, completed("a.ts")),
          assembly("codex", primary, completed("b.ts")),
        ],
        2,
      ),
    /unique provider ids/,
  );
});
