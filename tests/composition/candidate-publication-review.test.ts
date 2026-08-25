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
  it("derives the only Git identity from the matching completed publish run in bounded Run History", async () => {
    let requestedLimit: number | undefined;
    const review = createCandidatePublicationReview({
      loadConfig: () => ({ projects: [] }) as never,
      findProject: () =>
        ({ name: "project-a", path: "/trusted/project-a" }) as never,
      generateRunHistoryReport: (_project, options) => {
        requestedLimit = options?.limit;
        return {
          schemaVersion: 1,
          project: "project-a",
          limit: 100,
          entries: [run],
          corruptedLines: 0,
        };
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
    assert.equal(requestedLimit, 100);
  });

  it("does not call Git review without an exact completed publish identity", async () => {
    let reviewerCalled = false;
    const review = createCandidatePublicationReview({
      loadConfig: () => ({ projects: [] }) as never,
      findProject: () => ({ name: "project-a", path: "/trusted" }) as never,
      generateRunHistoryReport: () => ({
        schemaVersion: 1,
        project: "project-a",
        limit: 100,
        entries: [{ ...run, mode: "execute", publication: null }],
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

  it("fails closed for an unknown run and for a completed run without a candidate ref publication", async () => {
    for (const entries of [
      [],
      [
        {
          ...run,
          publication: {
            kind: "other" as never,
            ref: "refs/loop-engine/candidates/project-a/run-123",
            commitSha: "a".repeat(40),
            baseSha: "b".repeat(40),
          },
        },
      ],
    ]) {
      let reviewerCalled = false;
      const review = createCandidatePublicationReview({
        loadConfig: () => ({ projects: [] }) as never,
        findProject: () => ({ name: "project-a", path: "/trusted" }) as never,
        generateRunHistoryReport: () => ({
          schemaVersion: 1,
          project: "project-a",
          limit: 100,
          entries,
          corruptedLines: 0,
        }),
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
});
