import assert from "node:assert/strict";
import test from "node:test";

import { runExecutionDecisionProposal } from "../../src/composition/execution-decision-proposal.js";

const sha = "a".repeat(40);
const input = {
  project: "lp-infra",
  candidateId: "H4-L1",
  sourceDocument: "docs/roadmap.md",
  gitHead: sha,
  provider: "anthropic_api" as const,
  model: "claude-sonnet-5" as const,
  effort: "low" as const,
  timeoutMs: 60_000 as const,
};
const current = {
  project: "lp-infra",
  projectPath: "/tmp/lp",
  candidateId: "H4-L1",
  sourceDocument: "docs/roadmap.md",
  gitHead: sha,
  executionDecisionPath: ".governance/execution-decision.yaml",
  projectConfig: {},
} as never;

test("execution-decision proposal refuses implicit paid provider construction", async () => {
  const report = await runExecutionDecisionProposal(input, {
    current: () => current,
  });

  assert.deepEqual(report, {
    schemaVersion: 1,
    project: "lp-infra",
    result: { status: "failed", code: "provider_not_configured" },
  });
});
