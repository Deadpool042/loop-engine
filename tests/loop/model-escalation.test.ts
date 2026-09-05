import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import type { AgentProfile } from "../../src/agents/types.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";
import {
  resolveIntraProviderModelEscalation,
  resolveModelAttemptBudget,
} from "../../src/loop/model-escalation.js";
import { DEFAULT_AGENT_POLICY } from "../../src/policy/defaults.js";
import { resolvePolicy } from "../../src/policy/resolver.js";

function profile(
  id: string,
  model: string,
  economicTier: AgentProfile["economicTier"],
  overrides: Partial<AgentProfile> = {},
): AgentProfile {
  return {
    id,
    runtime: "codex",
    provider: "openai",
    model,
    effort:
      economicTier === "economy"
        ? "low"
        : economicTier === "standard"
          ? "medium"
          : "high",
    economicTier,
    availability: "available",
    capabilities: ["code_edit", "shell_exec", "test_execution"],
    permissions: ["read_only", "write_worktree", "shell_exec"],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: 300_000,
      maxCalls: 1,
      maxRepairs: 1,
    },
    ...overrides,
  };
}

const CANDIDATE: RoadmapCandidate = {
  path: "docs/roadmap/project.md",
  line: 1,
  text: "- [ ] Implement the governed execution lot",
  kind: "safe",
  reason: "fixture",
  status: "todo",
  priority: "default",
};

function resolved(
  registry: ReturnType<typeof createAgentRegistry>,
  maxCalls = 2,
  allowedFundingModes?: NonNullable<
    typeof DEFAULT_AGENT_POLICY.allowedFundingModes
  >,
) {
  const resolution = resolvePolicy({
    policy: {
      ...DEFAULT_AGENT_POLICY,
      ...(allowedFundingModes === undefined ? {} : { allowedFundingModes }),
    },
    registry,
    candidate: CANDIDATE,
    mode: "execute",
  });
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.selection?.outcome, "selected");
  return Object.freeze({
    ...resolution,
    selectionRequest: Object.freeze({
      ...resolution.selectionRequest,
      budgetCeiling: Object.freeze({
        ...resolution.selectionRequest.budgetCeiling,
        maxCalls,
      }),
    }),
  });
}

function planFromResolution(
  resolution: ReturnType<typeof resolved>,
): LoopExecutionPlan {
  assert.equal(resolution.selection?.outcome, "selected");
  const selected =
    resolution.selection?.outcome === "selected"
      ? resolution.selection.profile
      : null;
  assert.ok(selected);

  return {
    schemaVersion: 1,
    runId: "run",
    project: { name: "fixture" },
    candidate: CANDIDATE,
    contextPackage: {} as LoopExecutionPlan["contextPackage"],
    provider: selected.provider,
    runtime: selected.runtime,
    profileId: selected.id,
    model: selected.model,
    effort: resolution.requirements.minimumEffort,
    delegation: "runtime_managed_allowed",
    budget: selected.budget,
    policy: {
      id: resolution.policyId,
      mode: "execute",
      status: "resolved",
      requiredCapabilities: resolution.requirements.requiredCapabilities,
      requiredPermissions: resolution.requirements.requiredPermissions,
      ...(resolution.selectionRequest.allowedFundingModes === undefined
        ? {}
        : {
            allowedFundingModes:
              resolution.selectionRequest.allowedFundingModes,
          }),
      rationale: resolution.reasons,
    },
  };
}

describe("bounded intra-provider model escalation", () => {
  it("uses the policy call ceiling but never allows more than one escalation", () => {
    const registry = createAgentRegistry([
      profile("codex.economy", "luna", "economy"),
    ]);
    const resolution = resolved(registry, 8);

    assert.equal(resolveModelAttemptBudget(resolution, true), 2);
    assert.equal(resolveModelAttemptBudget(resolution, false), 1);
  });

  it("moves directly to the next admissible economic tier on provider_max_turns", () => {
    const registry = createAgentRegistry([
      profile("codex.economy", "luna", "economy"),
      profile("codex.standard", "terra", "standard"),
      profile("codex.advanced", "sol", "advanced"),
    ]);
    const resolution = resolved(registry);
    const currentPlan = planFromResolution(resolution);

    const decision = resolveIntraProviderModelEscalation({
      registry,
      resolution,
      currentPlan,
      allowEscalation: true,
      completedAttempts: 1,
      maxAttempts: 2,
      failureCode: "provider_max_turns",
    });

    assert.equal(decision.outcome, "escalated");
    assert.equal(
      decision.outcome === "escalated" ? decision.profile.id : null,
      "codex.standard",
    );
    assert.equal(
      decision.outcome === "escalated" ? decision.evidence.toModel : null,
      "terra",
    );
  });

  it("never changes provider or runtime during a model escalation", () => {
    const registry = createAgentRegistry([
      profile("codex.economy", "luna", "economy"),
      profile("claude.cheap", "haiku", "standard", {
        provider: "anthropic",
        runtime: "claude_code",
      }),
      profile("codex.advanced", "sol", "advanced"),
    ]);
    const resolution = resolved(registry);
    const decision = resolveIntraProviderModelEscalation({
      registry,
      resolution,
      currentPlan: planFromResolution(resolution),
      allowEscalation: true,
      completedAttempts: 1,
      maxAttempts: 2,
      failureCode: "validation_failed",
    });

    assert.equal(decision.outcome, "escalated");
    assert.equal(
      decision.outcome === "escalated" ? decision.profile.provider : null,
      "openai",
    );
    assert.equal(
      decision.outcome === "escalated" ? decision.profile.runtime : null,
      "codex",
    );
  });

  it("does not escalate runtime/provider failures that belong to failover", () => {
    const registry = createAgentRegistry([
      profile("codex.economy", "luna", "economy"),
      profile("codex.standard", "terra", "standard"),
    ]);
    const resolution = resolved(registry);

    for (const failureCode of [
      "provider_timeout",
      "provider_rate_limited",
      "provider_unavailable",
      "runtime_unavailable",
      "executor_unavailable",
    ]) {
      const decision = resolveIntraProviderModelEscalation({
        registry,
        resolution,
        currentPlan: planFromResolution(resolution),
        allowEscalation: true,
        completedAttempts: 1,
        maxAttempts: 2,
        failureCode,
      });
      assert.deepEqual(decision, {
        outcome: "not_applicable",
        reason: "failure_not_model_related",
      });
    }
  });

  it("fails closed when the policy attempt budget is already exhausted", () => {
    const registry = createAgentRegistry([
      profile("codex.economy", "luna", "economy"),
      profile("codex.standard", "terra", "standard"),
    ]);
    const resolution = resolved(registry);

    const decision = resolveIntraProviderModelEscalation({
      registry,
      resolution,
      currentPlan: planFromResolution(resolution),
      allowEscalation: true,
      completedAttempts: 2,
      maxAttempts: 2,
      failureCode: "validation_failed",
    });

    assert.deepEqual(decision, {
      outcome: "not_applicable",
      reason: "attempt_budget_exhausted",
    });
  });

  it("does not escalate from included subscription usage into paid credits without policy approval", () => {
    const registry = createAgentRegistry([
      profile("codex.economy", "luna", "economy", {
        fundingMode: "included_subscription",
      }),
      profile("codex.standard", "terra", "standard", {
        fundingMode: "additional_credits",
      }),
    ]);
    const resolution = resolved(registry);

    const decision = resolveIntraProviderModelEscalation({
      registry,
      resolution,
      currentPlan: planFromResolution(resolution),
      allowEscalation: true,
      completedAttempts: 1,
      maxAttempts: 2,
      failureCode: "validation_failed",
    });

    assert.deepEqual(decision, {
      outcome: "not_applicable",
      reason: "no_higher_profile",
    });
  });

  it("permits a paid intra-provider escalation only when policy explicitly admits that funding mode", () => {
    const registry = createAgentRegistry([
      profile("codex.economy", "luna", "economy", {
        fundingMode: "included_subscription",
      }),
      profile("codex.standard", "terra", "standard", {
        fundingMode: "additional_credits",
      }),
    ]);
    const resolution = resolved(registry, 2, [
      "included_subscription",
      "additional_credits",
    ]);

    const decision = resolveIntraProviderModelEscalation({
      registry,
      resolution,
      currentPlan: planFromResolution(resolution),
      allowEscalation: true,
      completedAttempts: 1,
      maxAttempts: 2,
      failureCode: "validation_failed",
    });

    assert.equal(decision.outcome, "escalated");
    assert.equal(
      decision.outcome === "escalated" ? decision.profile.id : null,
      "codex.standard",
    );
  });

  it("never selects a higher tier that cannot satisfy the admitted hard requirements", () => {
    const registry = createAgentRegistry([
      profile("codex.economy", "luna", "economy"),
      profile("codex.standard", "terra", "standard", {
        capabilities: ["code_edit"],
      }),
      profile("codex.advanced", "sol", "advanced"),
    ]);
    const resolution = resolved(registry);
    const decision = resolveIntraProviderModelEscalation({
      registry,
      resolution,
      currentPlan: planFromResolution(resolution),
      allowEscalation: true,
      completedAttempts: 1,
      maxAttempts: 2,
      failureCode: "provider_max_turns",
    });

    assert.equal(decision.outcome, "escalated");
    assert.equal(
      decision.outcome === "escalated" ? decision.profile.id : null,
      "codex.advanced",
    );
  });
});
