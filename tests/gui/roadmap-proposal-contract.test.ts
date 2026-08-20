import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRoadmapProposalReport } from "../../src/gui/desktop/roadmap-proposal-contract.js";

describe("GUI roadmap proposal contract", () => {
  it("parses a completed report with no_proposal", () => {
    const report = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      result: { status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", durationMs: 1200 },
      assessment: { observedGaps: [], assumptions: [] },
      proposal: { status: "no_proposal", reason: "Roadmap complète et sans écart matériel." },
    });

    assert.notEqual(report, null);
    assert.equal(report?.proposal?.status, "no_proposal");
  });

  it("parses a completed report with proposed lots, gaps and assumptions", () => {
    const report = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      result: { status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", durationMs: 900 },
      assessment: { observedGaps: ["gap-1"], assumptions: ["assumption-1"] },
      proposal: {
        status: "proposed",
        summary: "Deux lots complémentaires.",
        lots: [
          {
            title: "Lot A",
            objective: "Objectif A",
            benefit: "Bénéfice A",
            cost: "low",
            risk: "low",
            dependencies: [],
          },
        ],
      },
    });

    assert.notEqual(report, null);
    assert.equal(report?.proposal?.status, "proposed");
    if (report?.proposal?.status === "proposed") {
      assert.equal(report.proposal.lots.length, 1);
      assert.equal(report.proposal.lots[0]?.title, "Lot A");
    }
    assert.deepEqual(report?.assessment?.observedGaps, ["gap-1"]);
  });

  it("parses unavailable and failed results", () => {
    const unavailable = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      result: { status: "unavailable", reason: "provider_unconfigured" },
    });
    assert.equal(unavailable?.result.status, "unavailable");

    const failed = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      result: { status: "failed", reason: "provider_error" },
    });
    assert.equal(failed?.result.status, "failed");
  });

  it("rejects an invalid schema version or missing project name", () => {
    assert.equal(
      parseRoadmapProposalReport({
        schemaVersion: 2,
        project: { name: "loop-engine" },
        result: { status: "unavailable", reason: "x" },
      }),
      null,
    );
    assert.equal(
      parseRoadmapProposalReport({
        schemaVersion: 1,
        project: {},
        result: { status: "unavailable", reason: "x" },
      }),
      null,
    );
  });

  it("rejects a malformed proposal shape", () => {
    assert.equal(
      parseRoadmapProposalReport({
        schemaVersion: 1,
        project: { name: "loop-engine" },
        result: { status: "completed", provider: "anthropic_api", model: "claude-sonnet-5", durationMs: 1 },
        proposal: { status: "proposed" },
      }),
      null,
    );
  });

  it("rejects non-object input", () => {
    assert.equal(parseRoadmapProposalReport(null), null);
    assert.equal(parseRoadmapProposalReport("not-json"), null);
  });
});
