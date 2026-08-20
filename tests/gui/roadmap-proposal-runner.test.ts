import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createRoadmapProposalRunner,
  selectRoadmapProposalEstimate,
  shouldDisplayRoadmapProposalResult,
} from "../../src/gui/desktop/app.js";

describe("GUI roadmap proposal runner", () => {
  it("selects an already-computed option locally and restores the recommendation with auto", () => {
    const estimate = {
      status: "available" as const,
      profile: "balanced" as const,
      model: "claude-sonnet-5",
      effort: "low" as const,
      reason: "bounded_open_work",
      estimatedInputTokens: 2073,
      estimatedOutputTokens: 500,
      options: [
        { profile: "economy" as const, model: "claude-haiku-4-5", effort: null, estimatedInputTokens: 2073, estimatedOutputTokens: 500, estimatedCostUsd: 0.004573 },
        { profile: "balanced" as const, model: "claude-sonnet-5", effort: "low" as const, estimatedInputTokens: 2073, estimatedOutputTokens: 500, estimatedCostUsd: 0.009146 },
        { profile: "deep" as const, model: "claude-sonnet-5", effort: "medium" as const, estimatedInputTokens: 2073, estimatedOutputTokens: 500, estimatedCostUsd: 0.009146 },
      ],
    };

    assert.equal(selectRoadmapProposalEstimate(estimate, "economy")?.model, "claude-haiku-4-5");
    assert.equal(selectRoadmapProposalEstimate(estimate, "economy")?.effort, null);
    assert.equal(selectRoadmapProposalEstimate(estimate, "deep")?.effort, "medium");
    assert.equal(selectRoadmapProposalEstimate(estimate, "auto")?.profile, "balanced");
  });

  it("collapses a double click into a single active invocation", async () => {
    let invokeCount = 0;
    let resolveInvoke: (() => void) | null = null;
    const selections: string[] = [];
    const invoke = (_projectName: string, profileSelection: string) =>
      new Promise<{ ok: true; json: unknown; exitCode: number }>((resolve) => {
        invokeCount += 1;
        selections.push(profileSelection);
        resolveInvoke = () =>
          resolve({
            ok: true,
            json: {
              schemaVersion: 1,
              project: { name: "loop-engine" },
              result: { status: "unavailable", reason: "provider_unconfigured" },
            },
            exitCode: 0,
          });
      });

    const starts: string[] = [];
    const runner = createRoadmapProposalRunner({
      invoke,
      onStart: (projectName) => starts.push(projectName),
      onResult: () => {},
    });

    const firstCall = runner.start("loop-engine", "balanced");
    const secondCall = runner.start("loop-engine", "deep");
    assert.equal(invokeCount, 1);
    assert.deepEqual(selections, ["balanced"]);
    assert.deepEqual(starts, ["loop-engine"]);

    resolveInvoke?.();
    await firstCall;
    await secondCall;
    assert.equal(runner.isActive(), false);
  });

  it("allows a new call once the previous one has settled", async () => {
    let invokeCount = 0;
    const runner = createRoadmapProposalRunner({
      invoke: async () => {
        invokeCount += 1;
        return {
          ok: true as const,
          json: {
            schemaVersion: 1,
            project: { name: "loop-engine" },
            result: {
              status: "unavailable" as const,
              reason: "provider_unconfigured",
            },
          },
          exitCode: 0,
        };
      },
      onStart: () => {},
      onResult: () => {},
    });

    await runner.start("loop-engine", "auto");
    await runner.start("loop-engine", "economy");
    assert.equal(invokeCount, 2);
  });

  it("forwards the closed profile selection to the invocation", async () => {
    const invocations: unknown[] = [];
    const runner = createRoadmapProposalRunner({
      invoke: async (projectName, profileSelection) => {
        invocations.push([projectName, profileSelection]);
        return {
          ok: true as const,
          json: {
            schemaVersion: 1,
            project: { name: projectName },
            result: { status: "unavailable", reason: "provider_unconfigured" },
          },
          exitCode: 0,
        };
      },
      onStart: () => {},
      onResult: () => {},
    });

    await runner.start("loop-engine", "deep");
    assert.deepEqual(invocations, [["loop-engine", "deep"]]);
  });

  it("reports the parsed report through onResult on success", async () => {
    const results: unknown[] = [];
    const runner = createRoadmapProposalRunner({
      invoke: async () => ({
        ok: true as const,
        json: {
          schemaVersion: 1,
          project: { name: "loop-engine" },
          result: {
            status: "completed" as const,
            provider: "anthropic_api",
            model: "claude-sonnet-5",
            effort: "low",
            durationMs: 10,
          },
          proposal: {
            status: "no_proposal" as const,
            reason: "Roadmap complète.",
          },
        },
        exitCode: 0,
      }),
      onStart: () => {},
      onResult: (projectName, result) => results.push([projectName, result]),
    });

    await runner.start("loop-engine", "balanced");
    assert.equal(results.length, 1);
    const [projectName, result] = results[0] as [string, { ok: boolean }];
    assert.equal(projectName, "loop-engine");
    assert.equal(result.ok, true);
  });

  it("reports an ignorable error when the CLI invocation fails", async () => {
    const results: unknown[] = [];
    const runner = createRoadmapProposalRunner({
      invoke: async () => ({
        ok: false as const,
        kind: "spawn-error" as const,
        raw: "credential unavailable",
      }),
      onStart: () => {},
      onResult: (projectName, result) => results.push([projectName, result]),
    });

    await runner.start("loop-engine", "auto");
    assert.deepEqual(results, [
      ["loop-engine", { ok: false, message: "credential unavailable" }],
    ]);
  });
});

describe("GUI roadmap proposal staleness predicate", () => {
  it("keeps results for the currently selected project", () => {
    assert.equal(
      shouldDisplayRoadmapProposalResult("loop-engine", "loop-engine"),
      true,
    );
  });

  it("discards a stale result after the project changed", () => {
    assert.equal(
      shouldDisplayRoadmapProposalResult("loop-engine", "lp-infra"),
      false,
    );
    assert.equal(shouldDisplayRoadmapProposalResult("loop-engine", null), false);
  });
});
