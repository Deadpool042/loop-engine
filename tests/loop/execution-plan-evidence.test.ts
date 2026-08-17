import assert from "node:assert/strict";
import { test } from "node:test";

import { projectLoopExecutionPlanEvidence } from "../../src/loop/execution-plan-evidence.js";
import { generateExecutionReportWithEvidence } from "../../src/core/loop-execution-plan-evidence-report.js";

test("projects bounded immutable evidence from an admitted execution policy", () => {
  const resolution = {
    status: "resolved",
    policyId: "default-agent-policy",
    mode: "execute",
    reasons: ["selected deterministic profile"],
    requirements: {
      requiredCapabilities: ["code"],
      requiredPermissions: ["workspace_write"],
      rationale: ["safe candidate"],
    },
    selection: {
      outcome: "selected",
      profile: {
        id: "codex-medium",
        provider: "openai",
        runtime: "codex",
        model: "gpt-5.6-terra",
        effort: "medium",
        budget: { maxInputTokens: 10_000, maxOutputTokens: 4_000 },
      },
      rejected: [],
    },
  } as any;

  const evidence = projectLoopExecutionPlanEvidence(resolution);
  assert.equal(evidence?.provider, "openai");
  assert.equal(evidence?.runtime, "codex");
  assert.equal(evidence?.profileId, "codex-medium");
  assert.equal(evidence?.policy.id, "default-agent-policy");
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal("project" in (evidence as object), false);
  assert.equal("contextPackage" in (evidence as object), false);
});

test("evidence effort reflects the resolved policy requirement, not the profile's own effort", () => {
  const resolution = {
    status: "resolved",
    policyId: "default-agent-policy",
    mode: "execute",
    reasons: ["selected deterministic profile"],
    requirements: {
      minimumEffort: "medium",
      requiredCapabilities: ["code"],
      requiredPermissions: ["workspace_write"],
      rationale: ["safe candidate"],
    },
    selection: {
      outcome: "selected",
      profile: {
        id: "claude-code-low",
        provider: "anthropic",
        runtime: "claude_code",
        model: "claude-haiku-4-5",
        effort: "low",
        budget: { maxInputTokens: 10_000, maxOutputTokens: 4_000 },
      },
      rejected: [],
    },
  } as any;

  const evidence = projectLoopExecutionPlanEvidence(resolution);
  assert.equal(evidence?.effort, "medium");
});

test("execution reports include null evidence when no execution was admitted", () => {
  const result = {
    schemaVersion: 1,
    runId: "run-1",
    project: "fixture",
    mode: "plan",
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    candidate: null,
    steps: [],
    validation: null,
    modifiedFiles: [],
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
  } as const;

  const report = generateExecutionReportWithEvidence(result);
  assert.equal(report.executionPlanEvidence, null);
});
