import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseRoadmapProposalEstimateReport } from "../../src/gui/desktop/roadmap-proposal-estimate-contract.js";

function report() {
  return {
    schemaVersion: 1,
    project: { name: "loop-engine" },
    estimate: {
      status: "available",
      profile: "economy",
      model: "claude-haiku-4-5",
      effort: null,
      reason: "roadmap_complete_no_signal",
      estimatedInputTokens: 2073,
      estimatedOutputTokens: 500,
      estimatedCostUsd: 0.004573,
      pricingEffectiveDate: "1970-01-01",
      options: [
        {
          profile: "economy",
          model: "claude-haiku-4-5",
          effort: null,
          estimatedInputTokens: 2073,
          estimatedOutputTokens: 500,
          estimatedCostUsd: 0.004573,
          pricingEffectiveDate: "1970-01-01",
        },
        {
          profile: "balanced",
          model: "claude-sonnet-5",
          effort: "low",
          estimatedInputTokens: 2073,
          estimatedOutputTokens: 500,
          estimatedCostUsd: 0.009146,
          pricingEffectiveDate: "1970-01-01",
        },
        {
          profile: "deep",
          model: "claude-sonnet-5",
          effort: "medium",
          estimatedInputTokens: 2073,
          estimatedOutputTokens: 500,
          estimatedCostUsd: 0.009146,
          pricingEffectiveDate: "1970-01-01",
        },
      ],
    },
  };
}

describe("roadmap proposal estimate GUI contract", () => {
  it("accepts the three closed estimate options and preserves their costs", () => {
    const parsed = parseRoadmapProposalEstimateReport(report());
    assert.ok(parsed);
    assert.equal(parsed.estimate.status, "available");
    if (parsed.estimate.status !== "available") return;
    assert.deepEqual(
      parsed.estimate.options.map((option) => [
        option.profile,
        option.model,
        option.effort,
        option.estimatedCostUsd,
      ]),
      [
        ["economy", "claude-haiku-4-5", null, 0.004573],
        ["balanced", "claude-sonnet-5", "low", 0.009146],
        ["deep", "claude-sonnet-5", "medium", 0.009146],
      ],
    );
  });

  it("rejects an arbitrary profile injected into estimate options", () => {
    const value = report();
    value.estimate.options[2] = {
      ...value.estimate.options[2]!,
      profile: "custom" as never,
    };
    assert.equal(parseRoadmapProposalEstimateReport(value), null);
  });

  it("rejects duplicate/missing closed profiles", () => {
    const value = report();
    value.estimate.options[2] = {
      ...value.estimate.options[2]!,
      profile: "balanced",
    };
    assert.equal(parseRoadmapProposalEstimateReport(value), null);
  });

  it("rejects a free model or effort injected into a closed profile option", () => {
    const freeModel = report();
    freeModel.estimate.options[0] = {
      ...freeModel.estimate.options[0]!,
      model: "claude-opus-custom",
    };
    assert.equal(parseRoadmapProposalEstimateReport(freeModel), null);

    const freeEffort = report();
    freeEffort.estimate.options[1] = {
      ...freeEffort.estimate.options[1]!,
      effort: "max",
    };
    assert.equal(parseRoadmapProposalEstimateReport(freeEffort), null);
  });
});
