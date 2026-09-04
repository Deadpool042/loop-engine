import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { type ProjectConfig } from "../../src/core/config.js";
import {
  generateRoadmapProposalEstimateReport,
  generateRoadmapProposalReport,
} from "../../src/core/reports.js";
import {
  ROADMAP_PROPOSAL_OUTPUT_SCHEMA,
  ROADMAP_PROPOSAL_SYSTEM_PROMPT,
} from "../../src/intelligence/roadmap-proposal.js";
import {
  toAnthropicOutputSchema,
  type TextOnlyProvider,
} from "../../src/text-only-provider/index.js";
import { estimateTokenCount } from "../../src/intelligence/roadmap-proposal-context-compaction.js";
import { MAX_PROPOSAL_CONTEXT_CANDIDATES } from "../../src/intelligence/proposal-context.js";

function setupProject(files: Readonly<Record<string, string>>): {
  path: string;
  cleanup: () => void;
} {
  const path = join(
    tmpdir(),
    `loop-proposal-report-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(path, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(path, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}

function project(path: string): ProjectConfig {
  return {
    name: "example",
    path,
    type: "fixture",
    required_docs: [],
    validation: [],
    requires_git: false,
    planning: { mode: "roadmap", objective_source: "objective.md" },
    roadmap: ["roadmap.md"],
  };
}

function fakeProvider(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): TextOnlyProvider {
  return {
    async invoke(input) {
      return {
        status: "completed",
        provider: "anthropic_api",
        model,
        output: JSON.stringify({
          assessment: { observedGaps: [], assumptions: [] },
          proposal: { status: "no_proposal", reason: "No observable gap." },
        }),
        durationMs: 5,
        truncated: false,
        usage: {
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
        },
        ...(input.effort === undefined ? {} : { effort: input.effort }),
      };
    },
  };
}

test("auto-routes a completed roadmap to economy/Haiku with no --provider-model and computes the actual calculated cost", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const report = await generateRoadmapProposalReport(project(fixture.path), {
      provider: fakeProvider("claude-haiku-4-5", {
        input_tokens: 1000,
        output_tokens: 100,
      }),
      providerAvailable: true,
      timeoutMs: 60_000,
    });

    assert.equal((report as { profile?: string }).profile, "economy");
    assert.equal(report.result.status, "completed");
    if (report.result.status === "completed") {
      assert.equal(report.result.model, "claude-haiku-4-5");
      assert.equal(report.result.effort, null);
      assert.deepEqual(report.result.usage, {
        inputTokens: 1000,
        outputTokens: 100,
      });
      const cost = (report.result as { actualCalculatedCostUsd?: number })
        .actualCalculatedCostUsd;
      assert.equal(cost, (1000 * 1.0) / 1_000_000 + (100 * 5.0) / 1_000_000);
    }
  } finally {
    fixture.cleanup();
  }
});

test("respects an explicit --provider-model override and does not attach a profile", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const report = await generateRoadmapProposalReport(project(fixture.path), {
      provider: fakeProvider("claude-sonnet-5", {
        input_tokens: 10,
        output_tokens: 10,
      }),
      providerAvailable: true,
      model: "claude-sonnet-5",
      timeoutMs: 60_000,
    });

    assert.equal("profile" in report, false);
    assert.equal(report.result.status, "completed");
    if (report.result.status === "completed") {
      assert.equal(report.result.model, "claude-sonnet-5");
    }
  } finally {
    fixture.cleanup();
  }
});

test("computes the actual calculated cost even when the provider completes but local business validation fails", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const badProvider: TextOnlyProvider = {
      async invoke(input) {
        return {
          status: "completed",
          provider: "anthropic_api",
          model: "claude-haiku-4-5",
          output: JSON.stringify({
            assessment: { observedGaps: [], assumptions: [] },
            proposal: { status: "no_proposal" },
          }),
          durationMs: 7,
          truncated: false,
          usage: { inputTokens: 1200, outputTokens: 40 },
          ...(input.effort === undefined ? {} : { effort: input.effort }),
        };
      },
    };
    const report = await generateRoadmapProposalReport(project(fixture.path), {
      provider: badProvider,
      providerAvailable: true,
      timeoutMs: 60_000,
    });

    assert.equal(report.result.status, "failed");
    if (report.result.status === "failed") {
      assert.equal(report.result.reason, "invalid_proposal_response");
      assert.equal(report.result.validationFailureCode, "empty_reason");
      assert.equal(report.result.model, "claude-haiku-4-5");
      assert.deepEqual(report.result.usage, {
        inputTokens: 1200,
        outputTokens: 40,
      });
      const cost = (report.result as { actualCalculatedCostUsd?: number })
        .actualCalculatedCostUsd;
      assert.equal(cost, (1200 * 1.0) / 1_000_000 + (40 * 5.0) / 1_000_000);
    }
  } finally {
    fixture.cleanup();
  }
});

test("the pre-click estimate never touches the provider and reports the same routing profile", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    let providerCalls = 0;
    const estimate = generateRoadmapProposalEstimateReport(
      project(fixture.path),
    );
    assert.equal(estimate.estimate.status, "available");
    if (estimate.estimate.status === "available") {
      assert.equal(estimate.estimate.profile, "economy");
      assert.equal(estimate.estimate.model, "claude-haiku-4-5");
      assert.equal(estimate.estimate.effort, null);
      assert.ok(estimate.estimate.estimatedInputTokens > 0);
      assert.ok(estimate.estimate.estimatedOutputTokens > 0);
      assert.deepEqual(
        estimate.estimate.options.map(({ profile, model, effort }) => ({
          profile,
          model,
          effort,
        })),
        [
          { profile: "economy", model: "claude-haiku-4-5", effort: null },
          { profile: "balanced", model: "claude-sonnet-5", effort: "low" },
          { profile: "deep", model: "claude-sonnet-5", effort: "medium" },
        ],
      );
      const economy = estimate.estimate.options[0]!;
      const balanced = estimate.estimate.options[1]!;
      const deep = estimate.estimate.options[2]!;
      assert.ok(economy.estimatedCostUsd !== undefined);
      assert.ok(balanced.estimatedCostUsd !== undefined);
      assert.equal(balanced.estimatedCostUsd, deep.estimatedCostUsd);
      assert.ok(balanced.estimatedCostUsd! > economy.estimatedCostUsd!);
    }
    assert.equal(providerCalls, 0);
  } finally {
    fixture.cleanup();
  }
});

test("28/29. estimatedInputTokens includes the real, sanitized Structured Outputs schema — no duplicated sanitization logic", () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const estimate = generateRoadmapProposalEstimateReport(
      project(fixture.path),
    );
    assert.equal(estimate.estimate.status, "available");
    if (estimate.estimate.status !== "available") return;

    const schemaJson = JSON.stringify(
      toAnthropicOutputSchema(ROADMAP_PROPOSAL_OUTPUT_SCHEMA),
    );
    const promptOnly = estimateTokenCount(ROADMAP_PROPOSAL_SYSTEM_PROMPT);
    const promptPlusSchema = promptOnly + estimateTokenCount(schemaJson);
    // The schema (via the exact provider transform, not a re-implementation)
    // must materially raise the estimate beyond prompt + context alone.
    assert.ok(estimate.estimate.estimatedInputTokens >= promptPlusSchema);
  } finally {
    fixture.cleanup();
  }
});

test("long completed history stays economy and remains provider-callable", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": Array.from(
      { length: MAX_PROPOSAL_CONTEXT_CANDIDATES + 25 },
      (_, index) => `- [x] Historical lot ${index + 1}`,
    ).join("\n"),
  });
  try {
    let providerCalls = 0;
    const provider: TextOnlyProvider = {
      async invoke(input) {
        providerCalls += 1;
        return fakeProvider("claude-haiku-4-5", {
          input_tokens: 100,
          output_tokens: 10,
        }).invoke(input);
      },
    };

    const report = await generateRoadmapProposalReport(project(fixture.path), {
      provider,
      providerAvailable: true,
      timeoutMs: 60_000,
    });

    assert.equal(report.profile, "economy");
    assert.equal(report.result.status, "completed");
    assert.equal(providerCalls, 1);
  } finally {
    fixture.cleanup();
  }
});

test("genuine active-candidate overflow remains deep and fail-closed before provider", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": Array.from(
      { length: MAX_PROPOSAL_CONTEXT_CANDIDATES + 1 },
      (_, index) => `- [ ] Active lot ${index + 1}`,
    ).join("\n"),
  });
  try {
    const estimate = generateRoadmapProposalEstimateReport(project(fixture.path));
    assert.equal(estimate.estimate.status, "available");
    if (estimate.estimate.status === "available") {
      assert.equal(estimate.estimate.profile, "deep");
      assert.equal(estimate.estimate.reason, "context_truncated");
    }

    let providerCalls = 0;
    const provider: TextOnlyProvider = {
      async invoke(input) {
        providerCalls += 1;
        return fakeProvider("claude-sonnet-5", {
          input_tokens: 100,
          output_tokens: 10,
        }).invoke(input);
      },
    };
    const report = await generateRoadmapProposalReport(project(fixture.path), {
      provider,
      providerAvailable: true,
      timeoutMs: 60_000,
    });

    assert.equal(report.profile, "deep");
    assert.equal(report.result.status, "unavailable");
    if (report.result.status === "unavailable") {
      assert.equal(report.result.reason, "proposal_context_truncated");
    }
    assert.equal(providerCalls, 0);
  } finally {
    fixture.cleanup();
  }
});

test("30. the real loop-engine repository uses exhausted-roadmap routing with a fully accounted estimate", () => {
  // Mirrors the `loop-engine` entry in projects.yaml (path: .) and validates
  // invariants of the current repository state. V40 is fully delivered, so
  // deterministic renewal routing uses the economy profile.
  const loopEngineProject: ProjectConfig = {
    name: "loop-engine",
    path: process.cwd(),
    type: "node-cli",
    required_docs: ["README.md", "docs/architecture/project-intelligence.md"],
    validation: ["pnpm run validate"],
    requires_git: false,
    planning: {
      mode: "roadmap",
      objective_source: "docs/architecture/final-objective.md",
    },
    roadmap: ["docs/roadmap/loop-engine.md"],
  };
  const estimate = generateRoadmapProposalEstimateReport(loopEngineProject);
  assert.equal(estimate.estimate.status, "available");
  if (estimate.estimate.status !== "available") return;
  assert.equal(estimate.estimate.profile, "economy");
  assert.equal(estimate.estimate.model, "claude-haiku-4-5");

  const schemaJson = JSON.stringify(
    toAnthropicOutputSchema(ROADMAP_PROPOSAL_OUTPUT_SCHEMA),
  );
  const promptPlusSchema =
    estimateTokenCount(ROADMAP_PROPOSAL_SYSTEM_PROMPT) +
    estimateTokenCount(schemaJson);
  assert.ok(estimate.estimate.estimatedInputTokens >= promptPlusSchema);
  assert.ok(estimate.estimate.estimatedOutputTokens > 0);
});

test("31. estimatedCostUsd uses the corrected estimatedInputTokens, not the old under-count", () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const estimate = generateRoadmapProposalEstimateReport(
      project(fixture.path),
    );
    assert.equal(estimate.estimate.status, "available");
    if (estimate.estimate.status !== "available") return;
    assert.ok("estimatedCostUsd" in estimate.estimate);
    const cost = (estimate.estimate as { estimatedCostUsd?: number })
      .estimatedCostUsd;
    assert.ok(cost !== undefined && cost > 0);
    // claude-haiku-4-5 pricing fixture: $1.00/M input, $5.00/M output.
    const expected =
      (estimate.estimate.estimatedInputTokens * 1.0) / 1_000_000 +
      (estimate.estimate.estimatedOutputTokens * 5.0) / 1_000_000;
    assert.ok(cost !== undefined && Math.abs(cost - expected) < 1e-9);
  } finally {
    fixture.cleanup();
  }
});

test("32. the estimate never touches the network", () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const originalFetch = globalThis.fetch;
    let called = false;
    // @ts-expect-error test-only stub
    globalThis.fetch = async () => {
      called = true;
      throw new Error("must not be called");
    };
    try {
      generateRoadmapProposalEstimateReport(project(fixture.path));
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(called, false);
  } finally {
    fixture.cleanup();
  }
});
