import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRoadmapProposalReport } from "../../src/gui/desktop/roadmap-proposal-contract.js";

describe("GUI roadmap proposal contract", () => {
  it("parses a completed report with no_proposal", () => {
    const report = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      result: {
        status: "completed",
        provider: "anthropic_api",
        model: "claude-sonnet-5",
        durationMs: 1200,
      },
      assessment: { observedGaps: [], assumptions: [] },
      proposal: {
        status: "no_proposal",
        reason: "Roadmap complète et sans écart matériel.",
      },
    });

    assert.notEqual(report, null);
    assert.equal(report?.proposal?.status, "no_proposal");
  });

  it("parses a completed report with proposed lots, gaps and assumptions", () => {
    const report = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      result: {
        status: "completed",
        provider: "anthropic_api",
        model: "claude-sonnet-5",
        durationMs: 900,
      },
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
        result: {
          status: "completed",
          provider: "anthropic_api",
          model: "claude-sonnet-5",
          durationMs: 1,
        },
        proposal: { status: "proposed" },
      }),
      null,
    );
  });

  it("rejects non-object input", () => {
    assert.equal(parseRoadmapProposalReport(null), null);
    assert.equal(parseRoadmapProposalReport("not-json"), null);
  });

  it("preserves usage, effort, profile and the actual calculated cost through the CLI JSON boundary", () => {
    const report = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      profile: "balanced",
      result: {
        status: "completed",
        provider: "anthropic_api",
        model: "claude-sonnet-5",
        effort: "low",
        durationMs: 2900,
        usage: { inputTokens: 2187, outputTokens: 184 },
        actualCalculatedCostUsd: 0.0031,
        pricingEffectiveDate: "1970-01-01",
      },
      proposal: { status: "no_proposal", reason: "Roadmap complète." },
    });

    assert.notEqual(report, null);
    assert.equal(report?.profile, "balanced");
    if (report?.result.status === "completed") {
      assert.equal(report.result.effort, "low");
      assert.deepEqual(report.result.usage, {
        inputTokens: 2187,
        outputTokens: 184,
      });
      assert.equal(report.result.actualCalculatedCostUsd, 0.0031);
      assert.equal(report.result.pricingEffectiveDate, "1970-01-01");
    } else {
      assert.fail("expected a completed result");
    }
  });

  it("degrades cleanly when usage is absent from a completed result", () => {
    const report = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      result: {
        status: "completed",
        provider: "anthropic_api",
        model: "claude-haiku-4-5",
        effort: null,
        durationMs: 400,
      },
      proposal: { status: "no_proposal", reason: "Roadmap complète." },
    });

    assert.notEqual(report, null);
    if (report?.result.status === "completed") {
      assert.equal(report.result.usage, undefined);
      assert.equal(report.result.actualCalculatedCostUsd, undefined);
    } else {
      assert.fail("expected a completed result");
    }
  });

  it("round-trips telemetry on a failed result whose provider call completed but local validation failed", () => {
    const report = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      result: {
        status: "failed",
        reason: "invalid_proposal_response",
        validationFailureCode: "empty_reason",
        provider: "anthropic_api",
        model: "claude-haiku-4-5",
        effort: null,
        durationMs: 850,
        usage: { inputTokens: 1160, outputTokens: 40 },
        actualCalculatedCostUsd: 0.00136,
        pricingEffectiveDate: "1970-01-01",
      },
    });

    assert.notEqual(report, null);
    if (report?.result.status === "failed") {
      assert.equal(report.result.reason, "invalid_proposal_response");
      assert.equal(report.result.validationFailureCode, "empty_reason");
      assert.equal(report.result.model, "claude-haiku-4-5");
      assert.deepEqual(report.result.usage, {
        inputTokens: 1160,
        outputTokens: 40,
      });
      assert.equal(report.result.actualCalculatedCostUsd, 0.00136);
    } else {
      assert.fail("expected a failed result");
    }
  });

  it("still parses a bare failed result without telemetry (provider-level failure)", () => {
    const report = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      result: { status: "failed", reason: "provider_error" },
    });

    assert.notEqual(report, null);
    if (report?.result.status === "failed") {
      assert.equal(report.result.reason, "provider_error");
      assert.equal(report.result.model, undefined);
      assert.equal(report.result.usage, undefined);
    } else {
      assert.fail("expected a failed result");
    }
  });

  it("27. accepts a completed result carrying normalizationWarnings", () => {
    const report = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      result: {
        status: "completed",
        provider: "anthropic_api",
        model: "claude-haiku-4-5",
        effort: null,
        durationMs: 500,
        usage: { inputTokens: 2058, outputTokens: 329 },
        normalizationWarnings: ["reason_truncated"],
      },
      proposal: { status: "no_proposal", reason: "Bounded reason." },
    });

    assert.notEqual(report, null);
    if (report?.result.status === "completed") {
      assert.deepEqual(report.result.normalizationWarnings, [
        "reason_truncated",
      ]);
    } else {
      assert.fail("expected a completed result");
    }
  });

  it("degrades cleanly when normalizationWarnings is absent from a completed result", () => {
    const report = parseRoadmapProposalReport({
      schemaVersion: 1,
      project: { name: "loop-engine" },
      result: {
        status: "completed",
        provider: "anthropic_api",
        model: "claude-haiku-4-5",
        effort: null,
        durationMs: 500,
      },
      proposal: { status: "no_proposal", reason: "Reason." },
    });

    assert.notEqual(report, null);
    if (report?.result.status === "completed") {
      assert.equal(report.result.normalizationWarnings, undefined);
    } else {
      assert.fail("expected a completed result");
    }
  });
});
