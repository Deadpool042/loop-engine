import assert from "node:assert/strict";
import test from "node:test";
import {
  generateRoadmapProposalFromContext,
  MAX_ROADMAP_PROPOSAL_ASSUMPTIONS,
  MAX_ROADMAP_PROPOSAL_DEPENDENCIES,
  MAX_ROADMAP_PROPOSAL_GAPS,
  MAX_ROADMAP_PROPOSAL_LOTS,
  MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS,
  MAX_ROADMAP_PROPOSAL_TITLE_CHARACTERS,
  ROADMAP_PROPOSAL_OUTPUT_SCHEMA,
  ROADMAP_PROPOSAL_VALIDATION_FAILURE_CODES,
} from "../../src/intelligence/roadmap-proposal.js";
import type { TextOnlyProvider } from "../../src/text-only-provider/index.js";

/**
 * Minimal structural JSON Schema check covering only the vocabulary used by
 * ROADMAP_PROPOSAL_OUTPUT_SCHEMA (object/array/string/anyOf/const/required/
 * additionalProperties). Not a general-purpose validator.
 */
function schemaAccepts(schema: unknown, value: unknown): boolean {
  if (typeof schema !== "object" || schema === null) return true;
  const s = schema as Record<string, unknown>;
  if (Array.isArray(s.anyOf))
    return s.anyOf.some((branch) => schemaAccepts(branch, value));
  if (s.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return false;
    const v = value as Record<string, unknown>;
    const required = Array.isArray(s.required) ? s.required : [];
    if (!required.every((key) => key in v)) return false;
    const properties = (s.properties ?? {}) as Record<string, unknown>;
    if (s.additionalProperties === false) {
      if (!Object.keys(v).every((key) => key in properties)) return false;
    }
    return Object.entries(v).every(([key, item]) =>
      key in properties ? schemaAccepts(properties[key], item) : true,
    );
  }
  if (s.type === "array") {
    if (!Array.isArray(value)) return false;
    if (typeof s.maxItems === "number" && value.length > s.maxItems)
      return false;
    return value.every((item) => schemaAccepts(s.items, item));
  }
  if (s.type === "string") {
    if (typeof value !== "string") return false;
    if (typeof s.const === "string" && value !== s.const) return false;
    return true;
  }
  return true;
}
const rootSchema = ROADMAP_PROPOSAL_OUTPUT_SCHEMA as Record<string, unknown>;
const rootProperties = rootSchema.properties as Record<string, unknown>;
const proposalSchema = rootProperties.proposal;

const context = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1 as const, project: { name: "loop-engine", nameTruncated: false, type: "node-cli", typeTruncated: false },
  planning: { mode: "roadmap" }, objective: { source: "docs/objective.md", available: true, eligibleForRoadmapProposal: true, content: "Goal." },
  context: "available" as const,
  roadmap: { configuredPaths: ["roadmap.md"], configuredPathsTotal: 1, configuredPathsTruncated: false, stats: { todo: 0, done: 1 }, summary: { selectable: 0 }, selectedCandidate: null, candidates: { items: [], total: 1, truncated: false }, phaseGates: { items: [], total: 0, truncated: false } },
  projectState: { git: { branch: "main", branchTruncated: false, clean: true, requiresGit: true }, validation: { commands: [], commandsTotal: 0, commandsTruncated: false, configured: true }, health: [] },
  ...overrides,
});
function fake(output: string, calls: { value: number }, model = "claude-sonnet-5"): TextOnlyProvider {
  return { async invoke() { calls.value += 1; return { status: "completed", provider: "anthropic_api", model, output, durationMs: 2, truncated: false, usage: { inputTokens: 900, outputTokens: 60 } }; } };
}
const noProposal = JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "no_proposal", reason: "No observable gap." } });
async function run(output: string, model = "claude-sonnet-5") {
  const calls = { value: 0 };
  return generateRoadmapProposalFromContext(context() as never, { provider: fake(output, calls, model), providerAvailable: true, model, timeoutMs: 1000 });
}
const lot = (overrides: Record<string, unknown> = {}) => ({ title: "t", objective: "o", benefit: "b", cost: "low", risk: "low", dependencies: [], ...overrides });

// ---------------------------------------------------------------------------
// Contract shape
// ---------------------------------------------------------------------------

test("the model is asked only for assessment/proposal — schemaVersion/project are never part of the transport schema", () => {
  assert.deepEqual(Object.keys(rootProperties).sort(), ["assessment", "proposal"]);
  assert.deepEqual([...(rootSchema.required as string[])].sort(), ["assessment", "proposal"]);
});
test("the public report always wraps a successful parse with the local deterministic schemaVersion/project", async () => {
  const result = await run(noProposal);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.project.name, "loop-engine");
});
test("transport schema discriminates no_proposal from proposed via anyOf", () => {
  assert.ok(Array.isArray((proposalSchema as Record<string, unknown>).anyOf));
  assert.equal(schemaAccepts(proposalSchema, { status: "no_proposal" }), false);
  assert.equal(schemaAccepts(proposalSchema, { status: "no_proposal", reason: "x" }), true);
  assert.equal(schemaAccepts(proposalSchema, { status: "proposed" }), false);
});
test("transport descriptions carry the length/count bounds the schema itself cannot enforce after sanitization", () => {
  const assessmentProps = (rootProperties.assessment as Record<string, unknown>).properties as Record<string, unknown>;
  assert.match((assessmentProps.observedGaps as Record<string, unknown>).description as string, /At most 5 items/);
  const branches = (proposalSchema as Record<string, unknown>).anyOf as Record<string, unknown>[];
  const proposedBranch = branches.find((branch) => (branch.properties as Record<string, unknown>).summary !== undefined)!;
  assert.match(((proposedBranch.properties as Record<string, unknown>).lots as Record<string, unknown>).description as string, /1 to 3 items/);
});

// ---------------------------------------------------------------------------
// 1-5: structural defects remain hard failures
// ---------------------------------------------------------------------------

test("1. invalid JSON fails", async () => {
  const result = await run("not json");
  assert.equal(result.result.status, "failed");
  if (result.result.status === "failed") assert.equal(result.result.validationFailureCode, "invalid_json");
});
test("2. a missing required field fails", async () => {
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] } }));
  assert.equal(result.result.status, "failed");
  if (result.result.status === "failed") assert.equal(result.result.validationFailureCode, "invalid_root");
});
test("3. an empty required string fails", async () => {
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "no_proposal", reason: "" } }));
  assert.equal(result.result.status, "failed");
  if (result.result.status === "failed") assert.equal(result.result.validationFailureCode, "empty_reason");
});
test("4. a genuinely unknown enum value fails (not a casing variant)", async () => {
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "maybe", reason: "x" } }));
  assert.equal(result.result.status, "failed");
  if (result.result.status === "failed") assert.equal(result.result.validationFailureCode, "invalid_status");
});
test("5. proposed with an empty lots array fails", async () => {
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "proposed", summary: "s", lots: [] } }));
  assert.equal(result.result.status, "failed");
  if (result.result.status === "failed") assert.equal(result.result.validationFailureCode, "invalid_lots_count");
});
test("unknown cost/risk value remains a structural failure", async () => {
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "proposed", summary: "s", lots: [lot({ cost: "urgent" })] } }));
  assert.equal(result.result.status, "failed");
  if (result.result.status === "failed") assert.equal(result.result.validationFailureCode, "invalid_lot");
});

// ---------------------------------------------------------------------------
// 6-20: presentation-bound overflow is normalized, not rejected
// ---------------------------------------------------------------------------

test("6. reason > 500 chars succeeds and is bounded", async () => {
  const overflow = "a".repeat(MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS + 50);
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "no_proposal", reason: overflow } }));
  assert.equal(result.result.status, "completed");
  if (result.result.status === "completed") assert.deepEqual(result.result.normalizationWarnings, ["reason_truncated"]);
  if (result.proposal?.status === "no_proposal") assert.equal(result.proposal.reason.length, MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS);
});
test("7. an overlong summary succeeds and is bounded", async () => {
  const overflow = "b".repeat(MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS + 50);
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "proposed", summary: overflow, lots: [lot()] } }));
  assert.equal(result.result.status, "completed");
  if (result.result.status === "completed") assert.deepEqual(result.result.normalizationWarnings, ["summary_truncated"]);
  if (result.proposal?.status === "proposed") assert.equal(result.proposal.summary.length, MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS);
});
test("8. an overlong gap is bounded", async () => {
  const overflow = "c".repeat(MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS + 10);
  const result = await run(JSON.stringify({ assessment: { observedGaps: [overflow], assumptions: [] }, proposal: { status: "no_proposal", reason: "x" } }));
  assert.equal(result.result.status, "completed");
  if (result.result.status === "completed") assert.ok(result.result.normalizationWarnings?.includes("gaps_truncated"));
  assert.equal(result.assessment?.observedGaps[0]?.length, MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS);
});
test("9. an overlong assumption is bounded", async () => {
  const overflow = "d".repeat(MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS + 10);
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [overflow] }, proposal: { status: "no_proposal", reason: "x" } }));
  assert.equal(result.result.status, "completed");
  if (result.result.status === "completed") assert.ok(result.result.normalizationWarnings?.includes("assumptions_truncated"));
  assert.equal(result.assessment?.assumptions[0]?.length, MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS);
});
test("10. overlong title/objective/benefit are bounded", async () => {
  const overTitle = "e".repeat(MAX_ROADMAP_PROPOSAL_TITLE_CHARACTERS + 10);
  const overText = "f".repeat(MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS + 10);
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "proposed", summary: "s", lots: [lot({ title: overTitle, objective: overText, benefit: overText })] } }));
  assert.equal(result.result.status, "completed");
  if (result.result.status === "completed") assert.deepEqual(result.result.normalizationWarnings, ["lot_text_truncated"]);
  if (result.proposal?.status === "proposed") {
    assert.equal(result.proposal.lots[0]?.title.length, MAX_ROADMAP_PROPOSAL_TITLE_CHARACTERS);
    assert.equal(result.proposal.lots[0]?.objective.length, MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS);
    assert.equal(result.proposal.lots[0]?.benefit.length, MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS);
  }
});
test("11. an overlong dependency is bounded", async () => {
  const overDep = "g".repeat(MAX_ROADMAP_PROPOSAL_TITLE_CHARACTERS + 10);
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "proposed", summary: "s", lots: [lot({ dependencies: [overDep] })] } }));
  assert.equal(result.result.status, "completed");
  if (result.result.status === "completed") assert.deepEqual(result.result.normalizationWarnings, ["dependencies_truncated"]);
  if (result.proposal?.status === "proposed") assert.equal(result.proposal.lots[0]?.dependencies[0]?.length, MAX_ROADMAP_PROPOSAL_TITLE_CHARACTERS);
});
test("12. observedGaps beyond 5 keeps the first 5", async () => {
  const gaps = Array.from({ length: MAX_ROADMAP_PROPOSAL_GAPS + 3 }, (_, i) => `gap-${i}`);
  const result = await run(JSON.stringify({ assessment: { observedGaps: gaps, assumptions: [] }, proposal: { status: "no_proposal", reason: "x" } }));
  assert.equal(result.result.status, "completed");
  assert.deepEqual(result.assessment?.observedGaps, gaps.slice(0, MAX_ROADMAP_PROPOSAL_GAPS));
  if (result.result.status === "completed") assert.deepEqual(result.result.normalizationWarnings, ["gaps_truncated"]);
});
test("13. assumptions beyond 3 keeps the first 3", async () => {
  const assumptions = Array.from({ length: MAX_ROADMAP_PROPOSAL_ASSUMPTIONS + 2 }, (_, i) => `assumption-${i}`);
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions }, proposal: { status: "no_proposal", reason: "x" } }));
  assert.equal(result.result.status, "completed");
  assert.deepEqual(result.assessment?.assumptions, assumptions.slice(0, MAX_ROADMAP_PROPOSAL_ASSUMPTIONS));
  if (result.result.status === "completed") assert.deepEqual(result.result.normalizationWarnings, ["assumptions_truncated"]);
});
test("14. lots beyond 3 keeps the first 3", async () => {
  const lots = Array.from({ length: MAX_ROADMAP_PROPOSAL_LOTS + 2 }, (_, i) => lot({ title: `lot-${i}` }));
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "proposed", summary: "s", lots } }));
  assert.equal(result.result.status, "completed");
  if (result.proposal?.status === "proposed") assert.deepEqual(result.proposal.lots.map((l) => l.title), ["lot-0", "lot-1", "lot-2"]);
  if (result.result.status === "completed") assert.deepEqual(result.result.normalizationWarnings, ["lots_truncated"]);
});
test("15. dependencies beyond 5 keeps the first 5", async () => {
  const dependencies = Array.from({ length: MAX_ROADMAP_PROPOSAL_DEPENDENCIES + 2 }, (_, i) => `dep-${i}`);
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "proposed", summary: "s", lots: [lot({ dependencies })] } }));
  assert.equal(result.result.status, "completed");
  if (result.proposal?.status === "proposed") assert.deepEqual(result.proposal.lots[0]?.dependencies, dependencies.slice(0, MAX_ROADMAP_PROPOSAL_DEPENDENCIES));
  if (result.result.status === "completed") assert.deepEqual(result.result.normalizationWarnings, ["dependencies_truncated"]);
});
test("16. order is preserved through truncation", async () => {
  const gaps = ["first", "second", "third", "fourth", "fifth", "sixth"];
  const result = await run(JSON.stringify({ assessment: { observedGaps: gaps, assumptions: [] }, proposal: { status: "no_proposal", reason: "x" } }));
  assert.deepEqual(result.assessment?.observedGaps, ["first", "second", "third", "fourth", "fifth"]);
});
test("17. no content is invented: kept text is a verbatim prefix of the model output", async () => {
  const overflow = "verbatim-prefix-" + "x".repeat(MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS);
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "no_proposal", reason: overflow } }));
  if (result.proposal?.status === "no_proposal") assert.ok(overflow.startsWith(result.proposal.reason));
});
test("18. truncation is Unicode-safe: never splits a surrogate pair", async () => {
  const emoji = "\u{1F600}"; // single codepoint, 2 UTF-16 code units
  const reason = "a".repeat(MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS - 1) + emoji;
  assert.equal(reason.length, MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS + 1);
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "no_proposal", reason } }));
  assert.equal(result.result.status, "completed");
  if (result.proposal?.status === "no_proposal") {
    assert.equal(result.proposal.reason.length, MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS - 1);
    assert.ok(!/[\uD800-\uDBFF]$/.test(result.proposal.reason));
  }
});
test("19. normalizationWarnings reflects exactly which bounds were applied", async () => {
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "proposed", summary: "s".repeat(MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS + 1), lots: [lot()] } }));
  if (result.result.status === "completed") assert.deepEqual(result.result.normalizationWarnings, ["summary_truncated"]);
});
test("20. normalization warnings never contain model content", async () => {
  const secret = "SENSITIVE_MODEL_TEXT_MARKER";
  const overflow = secret + "x".repeat(MAX_ROADMAP_PROPOSAL_TEXT_CHARACTERS);
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "no_proposal", reason: overflow } }));
  assert.ok(result.result.status === "completed" && result.result.normalizationWarnings !== undefined);
  assert.doesNotMatch(JSON.stringify(result.result.normalizationWarnings), new RegExp(secret));
});

// ---------------------------------------------------------------------------
// 21-27: non-regression
// ---------------------------------------------------------------------------

test("21. a normal no_proposal response is unchanged", async () => {
  const result = await run(noProposal);
  assert.equal(result.result.status, "completed");
  assert.equal(result.proposal?.status, "no_proposal");
  if (result.result.status === "completed") assert.equal(result.result.normalizationWarnings, undefined);
});
test("22. a normal proposed response is unchanged", async () => {
  const output = JSON.stringify({ assessment: { observedGaps: ["Gap"], assumptions: ["Assumption"] }, proposal: { status: "proposed", summary: "Summary", lots: [{ title: "Lot", objective: "Objective", benefit: "Benefit", cost: "low", risk: "low", dependencies: [] }] } });
  const result = await run(output);
  assert.equal(result.proposal?.status, "proposed");
  if (result.result.status === "completed") assert.equal(result.result.normalizationWarnings, undefined);
});
test("23. enum casing tolerance still applies exactly as before (no over-tolerance)", async () => {
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "No_Proposal", reason: "Reason." } }));
  assert.equal(result.result.status, "completed");
  assert.equal(result.proposal?.status, "no_proposal");
  const rejected = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "maybe_proposal", reason: "x" } }));
  assert.equal(rejected.result.status, "failed");
});
test("24. usage/duration/model/effort are preserved on a completed result", async () => {
  const result = await run(noProposal, "claude-haiku-4-5");
  assert.equal(result.result.status, "completed");
  if (result.result.status === "completed") {
    assert.equal(result.result.model, "claude-haiku-4-5");
    assert.equal(result.result.durationMs, 2);
    assert.deepEqual(result.result.usage, { inputTokens: 900, outputTokens: 60 });
    assert.equal(result.result.effort, null);
  }
});
test("25. a parse failure after a completed provider call preserves telemetry (actualCalculatedCostUsd is computed upstream in core/reports.ts)", async () => {
  const result = await run(JSON.stringify({ assessment: { observedGaps: [], assumptions: [] }, proposal: { status: "no_proposal" } }), "claude-haiku-4-5");
  assert.equal(result.result.status, "failed");
  if (result.result.status === "failed") {
    assert.equal(result.result.model, "claude-haiku-4-5");
    assert.deepEqual(result.result.usage, { inputTokens: 900, outputTokens: 60 });
    assert.ok((ROADMAP_PROPOSAL_VALIDATION_FAILURE_CODES as readonly string[]).includes(result.result.validationFailureCode as string));
  }
});
test("26. provider-level failures never carry validation telemetry, expose only structured providerFailure telemetry, and no secret/diagnostic-message leaks", async () => {
  const provider: TextOnlyProvider = { async invoke() { return { status: "failed", provider: "anthropic_api", model: "claude-haiku-4-5", code: "credential_unavailable", message: "no credential", diagnosticMessage: "api key sk-test-secret rejected", durationMs: 3, attempts: 1, requestId: "req_26", truncated: false }; } };
  const result = await generateRoadmapProposalFromContext(context() as never, { provider, providerAvailable: true, model: "claude-haiku-4-5", timeoutMs: 1000 });
  assert.equal(result.result.status, "failed");
  if (result.result.status === "failed") {
    assert.equal(result.result.reason, "provider_error");
    assert.equal(result.result.validationFailureCode, undefined);
    assert.equal(result.result.usage, undefined);
    assert.equal(result.result.model, undefined);
    assert.deepEqual(result.result.providerFailure, {
      code: "credential_unavailable",
      durationMs: 3,
      attempts: 1,
      requestId: "req_26",
    });
  }
  assert.doesNotMatch(JSON.stringify(result), /no credential|sk-test-secret/);
});
test("27. refuses unavailable, field-truncated, collection-truncated and missing-credential contexts before provider", async () => {
  const calls = { value: 0 };
  const base = context();
  const collectionTruncated = context({
    roadmap: {
      ...base.roadmap,
      candidates: {
        ...base.roadmap.candidates,
        truncated: true,
      },
    },
  });

  for (const [value, available] of [
    [
      context({
        context: null,
        objective: {
          available: false,
          eligibleForRoadmapProposal: false,
          reason: "planning_mode_maintenance",
        },
      }),
      true,
    ],
    [context({ project: { name: "loop-engine", nameTruncated: true } }), true],
    [collectionTruncated, true],
    [context(), false],
  ] as const) {
    const result = await generateRoadmapProposalFromContext(value as never, {
      provider: fake(noProposal, calls),
      providerAvailable: available,
      model: "claude-sonnet-5",
      timeoutMs: 1000,
    });
    assert.equal(result.result.status, "unavailable");
  }
  assert.equal(calls.value, 0);
});

test("proposal generation is provider-model-agnostic: identical contract for sonnet and haiku", async () => {
  const resultSonnet = await run(noProposal, "claude-sonnet-5");
  const resultHaiku = await run(noProposal, "claude-haiku-4-5");
  assert.equal(resultSonnet.result.status, "completed");
  assert.equal(resultHaiku.result.status, "completed");
  assert.equal(resultSonnet.proposal?.status, resultHaiku.proposal?.status);
});
