import assert from "node:assert/strict";
import test from "node:test";

import { selectRoadmapProposalProfile } from "../../src/intelligence/roadmap-proposal-routing.js";

function context(
  stats: Readonly<{
    total: number;
    todo: number;
    inProgress: number;
    done: number;
    unknown: number;
    blocked: number;
  }>,
  overrides: Readonly<{
    candidatesTruncated?: boolean;
    phaseGatesTruncated?: boolean;
    configuredPathsTruncated?: boolean;
  }> = {},
) {
  return {
    context: "available" as const,
    objective: { sourceTruncated: false },
    roadmap: {
      configuredPathsTruncated: overrides.configuredPathsTruncated ?? false,
      stats,
      candidates: {
        items: [],
        total: 0,
        truncated: overrides.candidatesTruncated ?? false,
      },
      phaseGates: {
        items: [],
        total: 0,
        truncated: overrides.phaseGatesTruncated ?? false,
      },
    },
  } as never;
}

test("routes a completed roadmap with no blocked candidates to economy", () => {
  const routing = selectRoadmapProposalProfile(
    context({
      total: 5,
      todo: 0,
      inProgress: 0,
      done: 5,
      unknown: 0,
      blocked: 0,
    }),
  );
  assert.equal(routing.profile, "economy");
  assert.equal(routing.model, "claude-haiku-4-5");
  assert.equal(routing.effort, null);
});

test("routes bounded open work to balanced", () => {
  const routing = selectRoadmapProposalProfile(
    context({
      total: 5,
      todo: 2,
      inProgress: 1,
      done: 2,
      unknown: 0,
      blocked: 1,
    }),
  );
  assert.equal(routing.profile, "balanced");
  assert.equal(routing.model, "claude-sonnet-5");
  assert.equal(routing.effort, "low");
});

test("routes multiple blocked candidates to deep", () => {
  const routing = selectRoadmapProposalProfile(
    context({
      total: 5,
      todo: 3,
      inProgress: 0,
      done: 2,
      unknown: 0,
      blocked: 3,
    }),
  );
  assert.equal(routing.profile, "deep");
  assert.equal(routing.model, "claude-sonnet-5");
  assert.equal(routing.effort, "medium");
});

test("routes a large open backlog to deep", () => {
  const routing = selectRoadmapProposalProfile(
    context({
      total: 20,
      todo: 16,
      inProgress: 0,
      done: 4,
      unknown: 0,
      blocked: 0,
    }),
  );
  assert.equal(routing.profile, "deep");
});

test("routes a truncated context to deep regardless of stats", () => {
  const routing = selectRoadmapProposalProfile(
    context(
      { total: 5, todo: 0, inProgress: 0, done: 5, unknown: 0, blocked: 0 },
      { candidatesTruncated: true },
    ),
  );
  assert.equal(routing.profile, "deep");
  assert.equal(routing.reason, "context_truncated");
});

test("routes an unavailable context to economy without inspecting anything else", () => {
  const routing = selectRoadmapProposalProfile({ context: null } as never);
  assert.equal(routing.profile, "economy");
  assert.equal(routing.reason, "context_unavailable");
});

test("is a pure, synchronous, provider-free function", () => {
  const input = context({
    total: 1,
    todo: 1,
    inProgress: 0,
    done: 0,
    unknown: 0,
    blocked: 0,
  });
  const first = selectRoadmapProposalProfile(input);
  const second = selectRoadmapProposalProfile(input);
  assert.deepEqual(first, second);
});
