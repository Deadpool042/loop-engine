import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideAgentRoute } from "../../src/agents/router.js";
import type { AgentProfile } from "../../src/agents/types.js";

function profile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "fixture",
    runtime: "codex",
    provider: "openai",
    model: "fixture-model",
    effort: "low",
    economicTier: "standard",
    fundingMode: "included_subscription",
    availability: "available",
    quota: { state: "available", source: "runtime_report" },
    capabilities: ["code_edit", "shell_exec"],
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

const request = {
  requiredCapabilities: ["code_edit", "shell_exec"] as const,
  requiredPermissions: ["write_worktree"] as const,
  allowedFundingModes: ["included_subscription"] as const,
};

describe("decideAgentRoute", () => {
  it("selects runtime/provider/model/effort from measured efficiency with explicit evidence", () => {
    const decision = decideAgentRoute({
      candidates: [
        {
          profile: profile({ id: "codex", model: "codex-model" }),
          executionPath: "direct_cli",
          executableNow: true,
        },
        {
          profile: profile({
            id: "claude",
            runtime: "claude_code",
            provider: "anthropic",
            model: "claude-model",
          }),
          executionPath: "direct_cli",
          executableNow: true,
        },
      ],
      request,
      effort: "medium",
      efficiencySignals: [
        {
          profileId: "codex",
          status: "available",
          quotaWindowLabel: "Week",
          expectedValuePercent: 80,
          expectedQuotaConsumedPercent: 10,
          sampleSize: 5,
        },
        {
          profileId: "claude",
          status: "available",
          quotaWindowLabel: "Week",
          expectedValuePercent: 90,
          expectedQuotaConsumedPercent: 5,
          sampleSize: 5,
        },
      ],
    });

    assert.equal(decision.outcome, "selected");
    assert.deepEqual(decision.selected, {
      profileId: "claude",
      runtime: "claude_code",
      provider: "anthropic",
      model: "claude-model",
      effort: "medium",
      executionPath: "direct_cli",
      basis: "measured_efficiency",
      efficiencyScore: 18,
      quotaWindowLabel: "Week",
      expectedValuePercent: 90,
      expectedQuotaConsumedPercent: 5,
      sampleSize: 5,
    });
    assert.deepEqual(decision.notSelected, [
      {
        profileId: "codex",
        runtime: "codex",
        provider: "openai",
        model: "codex-model",
        executionPath: "direct_cli",
        reason: "lower_efficiency",
        detail: "efficiency 8 is below selected 18",
      },
    ]);
  });

  it("falls back to smallest capable and keeps unavailable OpenClaw binding explicit", () => {
    const decision = decideAgentRoute({
      candidates: [
        {
          profile: profile({ id: "standard", economicTier: "standard" }),
          executionPath: "direct_cli",
          executableNow: true,
        },
        {
          profile: profile({ id: "frontier", economicTier: "frontier" }),
          executionPath: "direct_cli",
          executableNow: true,
        },
        {
          profile: profile({
            id: "openclaw",
            runtime: "openclaw",
            model: "native-model",
          }),
          executionPath: "openclaw_native",
          executableNow: false,
          bindingReason: "openclaw_native_binding_not_yet_promoted",
        },
      ],
      request,
      effort: "low",
      efficiencySignals: [],
    });

    assert.equal(decision.outcome, "selected");
    assert.equal(decision.selected?.profileId, "standard");
    assert.equal(decision.selected?.basis, "smallest_capable");
    assert.deepEqual(decision.notSelected, [
      {
        profileId: "frontier",
        runtime: "codex",
        provider: "openai",
        model: "fixture-model",
        executionPath: "direct_cli",
        reason: "frontier_not_required",
        detail: "frontier_not_required",
      },
      {
        profileId: "openclaw",
        runtime: "openclaw",
        provider: "openai",
        model: "native-model",
        executionPath: "openclaw_native",
        reason: "binding_unavailable",
        detail: "openclaw_native_binding_not_yet_promoted",
      },
    ]);
  });

  it("reports hard gates and returns no_match when no executable candidate survives", () => {
    const decision = decideAgentRoute({
      candidates: [
        {
          profile: profile({
            id: "offline",
            availability: "unavailable",
          }),
          executionPath: "direct_cli",
          executableNow: true,
        },
        {
          profile: profile({
            id: "native-only",
            runtime: "openclaw",
          }),
          executionPath: "openclaw_native",
          executableNow: false,
        },
      ],
      request,
      effort: "low",
      efficiencySignals: [],
    });

    assert.equal(decision.outcome, "no_match");
    assert.equal(decision.selected, null);
    assert.deepEqual(
      decision.notSelected.map((candidate) => ({
        profileId: candidate.profileId,
        reason: candidate.reason,
      })),
      [
        { profileId: "native-only", reason: "binding_unavailable" },
        { profileId: "offline", reason: "hard_gate" },
      ],
    );
  });

  it("keeps the static route when fewer than two same-tier profiles have measured performance", () => {
    const decision = decideAgentRoute({
      candidates: [
        {
          profile: profile({ id: "a-static", model: "static-model" }),
          executionPath: "direct_cli",
          executableNow: true,
        },
        {
          profile: profile({ id: "b-measured", model: "measured-model" }),
          executionPath: "direct_cli",
          executableNow: true,
        },
      ],
      request,
      effort: "low",
      efficiencySignals: [],
      performanceSignals: [
        {
          profileId: "b-measured",
          status: "available",
          terminalSuccessPercent: 100,
          firstPassValidationPercent: 100,
          medianDurationMs: 1_000,
          meanRepairAttempts: 0,
          scopeViolationPercent: 0,
          failoverPercent: 0,
          sampleSize: 5,
        },
      ],
    });

    assert.equal(decision.outcome, "selected");
    assert.equal(decision.selected?.profileId, "a-static");
    assert.equal(decision.selected?.basis, "smallest_capable");
  });

  it("uses measured performance only between same-tier profiles when the static winner is also measured", () => {
    const decision = decideAgentRoute({
      candidates: [
        {
          profile: profile({ id: "a-static", model: "static-model" }),
          executionPath: "direct_cli",
          executableNow: true,
        },
        {
          profile: profile({ id: "b-better", model: "better-model" }),
          executionPath: "direct_cli",
          executableNow: true,
        },
      ],
      request,
      effort: "medium",
      efficiencySignals: [],
      performanceSignals: [
        {
          profileId: "a-static",
          status: "available",
          terminalSuccessPercent: 60,
          firstPassValidationPercent: 80,
          medianDurationMs: 10_000,
          meanRepairAttempts: 0.2,
          scopeViolationPercent: 0,
          failoverPercent: 0,
          sampleSize: 5,
        },
        {
          profileId: "b-better",
          status: "available",
          terminalSuccessPercent: 80,
          firstPassValidationPercent: 80,
          medianDurationMs: 12_000,
          meanRepairAttempts: 0.2,
          scopeViolationPercent: 0,
          failoverPercent: 0,
          sampleSize: 5,
        },
      ],
    });

    assert.equal(decision.outcome, "selected");
    assert.deepEqual(decision.selected, {
      profileId: "b-better",
      runtime: "codex",
      provider: "openai",
      model: "better-model",
      effort: "medium",
      executionPath: "direct_cli",
      basis: "measured_performance",
      efficiencyScore: null,
      quotaWindowLabel: null,
      expectedValuePercent: 80,
      expectedQuotaConsumedPercent: null,
      sampleSize: 5,
      performanceEvidence: {
        terminalSuccessPercent: 80,
        firstPassValidationPercent: 80,
        medianDurationMs: 12_000,
        meanRepairAttempts: 0.2,
        scopeViolationPercent: 0,
        failoverPercent: 0,
        sampleSize: 5,
      },
    });
    assert.equal(
      decision.notSelected.find((entry) => entry.profileId === "a-static")?.reason,
      "lower_performance",
    );
  });

  it("never lets measured performance promote a frontier profile over a capable lower tier", () => {
    const decision = decideAgentRoute({
      candidates: [
        {
          profile: profile({ id: "standard", economicTier: "standard" }),
          executionPath: "direct_cli",
          executableNow: true,
        },
        {
          profile: profile({ id: "frontier", economicTier: "frontier" }),
          executionPath: "direct_cli",
          executableNow: true,
        },
      ],
      request,
      effort: "low",
      efficiencySignals: [],
      performanceSignals: [
        {
          profileId: "standard",
          status: "available",
          terminalSuccessPercent: 50,
          firstPassValidationPercent: 50,
          medianDurationMs: 20_000,
          meanRepairAttempts: 1,
          scopeViolationPercent: 10,
          failoverPercent: 10,
          sampleSize: 5,
        },
        {
          profileId: "frontier",
          status: "available",
          terminalSuccessPercent: 100,
          firstPassValidationPercent: 100,
          medianDurationMs: 1_000,
          meanRepairAttempts: 0,
          scopeViolationPercent: 0,
          failoverPercent: 0,
          sampleSize: 20,
        },
      ],
    });

    assert.equal(decision.outcome, "selected");
    assert.equal(decision.selected?.profileId, "standard");
    assert.equal(decision.selected?.basis, "smallest_capable");
  });

  it("rejects duplicate profile identities before routing", () => {
    assert.throws(
      () =>
        decideAgentRoute({
          candidates: [
            {
              profile: profile({ id: "same" }),
              executionPath: "direct_cli",
              executableNow: true,
            },
            {
              profile: profile({ id: "same", runtime: "openclaw" }),
              executionPath: "openclaw_native",
              executableNow: false,
            },
          ],
          request,
          effort: "low",
          efficiencySignals: [],
        }),
      /Duplicate AUTO route candidate id: same/,
    );
  });
});
