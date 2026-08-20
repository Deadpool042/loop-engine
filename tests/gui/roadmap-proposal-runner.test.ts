import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createRoadmapProposalRunner,
  shouldDisplayRoadmapProposalResult,
} from "../../src/gui/desktop/app.js";

describe("GUI roadmap proposal runner", () => {
  it("collapses a double click into a single active invocation", async () => {
    let invokeCount = 0;
    let resolveInvoke: (() => void) | null = null;
    const invoke = () =>
      new Promise<{ ok: true; json: unknown; exitCode: number }>((resolve) => {
        invokeCount += 1;
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

    const firstCall = runner.start("loop-engine");
    const secondCall = runner.start("loop-engine");
    assert.equal(invokeCount, 1);
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
            result: { status: "unavailable" as const, reason: "provider_unconfigured" },
          },
          exitCode: 0,
        };
      },
      onStart: () => {},
      onResult: () => {},
    });

    await runner.start("loop-engine");
    await runner.start("loop-engine");
    assert.equal(invokeCount, 2);
  });

  it("reports the parsed report through onResult on success", async () => {
    const results: unknown[] = [];
    const runner = createRoadmapProposalRunner({
      invoke: async () => ({
        ok: true as const,
        json: {
          schemaVersion: 1,
          project: { name: "loop-engine" },
          result: { status: "completed" as const, provider: "anthropic_api", model: "claude-sonnet-5", durationMs: 10 },
          proposal: { status: "no_proposal" as const, reason: "Roadmap complète." },
        },
        exitCode: 0,
      }),
      onStart: () => {},
      onResult: (projectName, result) => results.push([projectName, result]),
    });

    await runner.start("loop-engine");
    assert.equal(results.length, 1);
    const [projectName, result] = results[0] as [string, { ok: boolean }];
    assert.equal(projectName, "loop-engine");
    assert.equal(result.ok, true);
  });

  it("reports an ignorable error when the CLI invocation fails", async () => {
    const results: unknown[] = [];
    const runner = createRoadmapProposalRunner({
      invoke: async () => ({ ok: false as const, kind: "spawn-error" as const, raw: "credential unavailable" }),
      onStart: () => {},
      onResult: (projectName, result) => results.push([projectName, result]),
    });

    await runner.start("loop-engine");
    assert.deepEqual(results, [["loop-engine", { ok: false, message: "credential unavailable" }]]);
  });
});

describe("GUI roadmap proposal staleness predicate", () => {
  it("keeps results for the currently selected project", () => {
    assert.equal(shouldDisplayRoadmapProposalResult("loop-engine", "loop-engine"), true);
  });

  it("discards a stale result after the project changed", () => {
    assert.equal(shouldDisplayRoadmapProposalResult("loop-engine", "lp-infra"), false);
    assert.equal(shouldDisplayRoadmapProposalResult("loop-engine", null), false);
  });
});
