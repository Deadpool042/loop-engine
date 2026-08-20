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
import type { TextOnlyProvider } from "../../src/text-only-provider/index.js";

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
          schemaVersion: 1,
          project: { name: "example" },
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
    }
    assert.equal(providerCalls, 0);
  } finally {
    fixture.cleanup();
  }
});
