import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { printRunHistory } from "../../src/commands/runs.js";
import type { LoopApplicationAssembly } from "../../src/composition/index.js";
import type { LoopRunModelEfficiencyReport } from "../../src/core/index.js";

function captureConsoleLog(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return {
    lines,
    restore: () => {
      console.log = original;
    },
  };
}

const report: LoopRunModelEfficiencyReport = {
  schemaVersion: 1,
  project: "loop-engine",
  limit: 7,
  historyEntries: 2,
  executionRuns: 2,
  observedRuns: 2,
  unattributedExecutionRuns: 0,
  corruptedLines: 0,
  observations: [],
  models: [
    {
      provider: "openai",
      runtime: "codex",
      model: "gpt-5.6-luna",
      profileIds: ["configured.codex.economy"],
      terminalRuns: 2,
      outcomes: { completed: 2, failed: 0, blocked: 0, cancelled: 0 },
      validation: {
        observedRuns: 2,
        passedRuns: 2,
        failedRuns: 0,
        totalRepairAttempts: 0,
      },
      taskCategories: [{ category: "code", count: 2 }],
      duration: {
        observedRuns: 2,
        totalMs: 2_000,
        minMs: 900,
        maxMs: 1_100,
      },
      files: {
        modifiedTotal: 1,
        outOfScopeObservedRuns: 2,
        outOfScopeTotal: 0,
      },
    },
  ],
  providerAttempts: [],
  telemetry: {
    tokens: "unavailable",
    costUsd: "unavailable",
    quota: "unavailable",
    reason: "no_reliable_provider_usage_or_quota_source",
  },
};

describe("runs --models", () => {
  it("prints the bounded model-efficiency projection as JSON", () => {
    let observedProject: string | undefined;
    let observedLimit: number | undefined;
    const application = {
      generateRunModelEfficiencyReport(project: string, options: { limit?: number }) {
        observedProject = project;
        observedLimit = options.limit;
        return report;
      },
      generateRunHistoryReport() {
        throw new Error("normal run history report must not be used");
      },
    } as unknown as LoopApplicationAssembly;

    const capture = captureConsoleLog();
    try {
      printRunHistory(application, "loop-engine", {
        json: true,
        models: true,
        limit: 7,
      });
    } finally {
      capture.restore();
    }

    assert.equal(observedProject, "loop-engine");
    assert.equal(observedLimit, 7);
    assert.deepEqual(capture.lines.map((line) => JSON.parse(line)), [report]);
  });
});
