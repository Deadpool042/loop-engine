import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCandidatePublicationReview } from "../../src/composition/candidate-publication-review.js";
import type { LoopRunResult } from "../../src/loop/types.js";

const publication = {
  kind: "candidate_ref" as const,
  ref: "refs/loop-engine/candidates/project-a/run-123",
  commitSha: "a".repeat(40),
  baseSha: "b".repeat(40),
};

const run = {
  schemaVersion: 1,
  runId: "run-123",
  project: "project-a",
  mode: "publish",
  status: "completed",
  startedAt: "2026-08-25T00:00:00.000Z",
  completedAt: "2026-08-25T00:00:01.000Z",
  candidate: null,
  steps: [],
  validation: null,
  modifiedFiles: [],
  commit: null,
  publication,
  failure: null,
  agentPolicy: null,
  contextPackage: null,
} as const satisfies LoopRunResult;

describe("candidate publication review composition", () => {
  it("derives the only Git identity from one exact persisted run evidence", async () => {
    let requestedProject: string | undefined;
    let requestedRunId: string | undefined;
    const review = createCandidatePublicationReview({
      loadConfig: () => ({ projects: [] }) as never,
      findProject: () =>
        ({ name: "project-a", path: "/trusted/project-a" }) as never,
      lookupRunHistoryEntry: (project, runId) => {
        requestedProject = project;
        requestedRunId = runId;
        return { found: true, entry: run, corruptedLines: 0 };
      },
      candidateReviewer: async (input) => {
        assert.equal(input.project.path, "/trusted/project-a");
        assert.equal(input.runId, "run-123");
        assert.deepEqual(input.publication, publication);
        return { reviewed: false, code: "expected", message: "expected" };
      },
    });

    const result = await review("project-a", "run-123");
    assert.deepEqual(result, {
      reviewed: false,
      code: "expected",
      message: "expected",
    });
    assert.equal(requestedProject, "project-a");
    assert.equal(requestedRunId, "run-123");
  });

  it("does not call Git review without an exact completed publish identity", async () => {
    let reviewerCalled = false;
    const review = createCandidatePublicationReview({
      loadConfig: () => ({ projects: [] }) as never,
      findProject: () => ({ name: "project-a", path: "/trusted" }) as never,
      lookupRunHistoryEntry: () => ({
        found: true,
        entry: { ...run, mode: "execute", publication: null },
        corruptedLines: 0,
      }),
      candidateReviewer: async () => {
        reviewerCalled = true;
        throw new Error("must not be called");
      },
    });

    const result = await review("project-a", "run-123");
    assert.deepEqual(result, {
      reviewed: false,
      code: "candidate_run_not_found",
      message: "No completed candidate publication was found for this run.",
    });
    assert.equal(reviewerCalled, false);
  });

  it("fails closed for an unknown run and a completed run without a candidate publication", async () => {
    const lookups = [
      { found: false as const, code: "not_found" as const, corruptedLines: 0 },
      {
        found: true as const,
        entry: {
          ...run,
          publication: {
            kind: "other" as never,
            ref: "refs/loop-engine/candidates/project-a/run-123",
            commitSha: "a".repeat(40),
            baseSha: "b".repeat(40),
          },
        },
        corruptedLines: 0,
      },
    ];
    for (const lookup of lookups) {
      let reviewerCalled = false;
      const review = createCandidatePublicationReview({
        loadConfig: () => ({ projects: [] }) as never,
        findProject: () => ({ name: "project-a", path: "/trusted" }) as never,
        lookupRunHistoryEntry: () => lookup,
        candidateReviewer: async () => {
          reviewerCalled = true;
          throw new Error("must not be called");
        },
      });

      assert.deepEqual(await review("project-a", "run-123"), {
        reviewed: false,
        code: "candidate_run_not_found",
        message: "No completed candidate publication was found for this run.",
      });
      assert.equal(reviewerCalled, false);
    }
  });

  it("distinguishes ambiguous history from an unreadable evidence journal", async () => {
    for (const [lookupCode, expected] of [
      [
        "duplicate_run_id",
        {
          reviewed: false,
          code: "candidate_run_ambiguous",
          message: "Multiple Run History entries share this candidate run id.",
        },
      ],
      [
        "read_failed",
        {
          reviewed: false,
          code: "candidate_run_lookup_failed",
          message: "Candidate Run History evidence could not be inspected.",
        },
      ],
    ] as const) {
      const review = createCandidatePublicationReview({
        loadConfig: () => ({ projects: [] }) as never,
        findProject: () => ({ name: "project-a", path: "/trusted" }) as never,
        lookupRunHistoryEntry: () => ({
          found: false,
          code: lookupCode,
          corruptedLines: 0,
        }),
      });
      assert.deepEqual(await review("project-a", "run-123"), expected);
    }
  });
});
