import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCandidateReviewResponse } from "../../src/gui/desktop/candidate-review-contract.js";

const validReview = {
  reviewed: true,
  review: {
    schemaVersion: 1,
    project: "loop-engine",
    runId: "run-123",
    candidateRef: "refs/loop-engine/candidates/loop-engine/run-123",
    candidateCommitSha: "a".repeat(40),
    baseSha: "b".repeat(40),
    commit: {
      subject: "candidate commit",
      authorName: "Loop Engine",
      authoredAt: "2026-08-25T12:00:00+02:00",
    },
    changedFiles: [
      {
        path: "src/example.ts",
        status: "modified",
        additions: 3,
        deletions: 1,
      },
      {
        path: "assets/blob.bin",
        status: "added",
        additions: null,
        deletions: null,
      },
    ],
    additions: 3,
    deletions: 1,
  },
} as const;

describe("candidate review desktop contract", () => {
  it("projects one valid reviewed candidate", () => {
    assert.deepEqual(parseCandidateReviewResponse(validReview), {
      reviewed: true,
      review: {
        project: "loop-engine",
        runId: "run-123",
        candidateRef: "refs/loop-engine/candidates/loop-engine/run-123",
        candidateCommitSha: "a".repeat(40),
        baseSha: "b".repeat(40),
        commit: {
          subject: "candidate commit",
          authorName: "Loop Engine",
          authoredAt: "2026-08-25T12:00:00+02:00",
        },
        changedFiles: [
          {
            path: "src/example.ts",
            status: "modified",
            additions: 3,
            deletions: 1,
          },
          {
            path: "assets/blob.bin",
            status: "added",
            additions: null,
            deletions: null,
          },
        ],
        additions: 3,
        deletions: 1,
      },
    });
  });

  it("projects a structured review failure", () => {
    assert.deepEqual(
      parseCandidateReviewResponse({
        reviewed: false,
        code: "candidate_ref_stale",
        message: "Candidate ref is missing or moved.",
      }),
      {
        reviewed: false,
        code: "candidate_ref_stale",
        message: "Candidate ref is missing or moved.",
      },
    );
  });

  it("fails closed when the candidate ref does not match project and run id", () => {
    assert.equal(
      parseCandidateReviewResponse({
        ...validReview,
        review: {
          ...validReview.review,
          candidateRef: "refs/loop-engine/candidates/other/run-123",
        },
      }),
      null,
    );
  });

  it("fails closed for malformed SHAs and file projections", () => {
    for (const review of [
      { ...validReview.review, candidateCommitSha: "abc" },
      { ...validReview.review, baseSha: "A".repeat(40) },
      {
        ...validReview.review,
        changedFiles: [
          {
            path: "src/example.ts",
            status: "renamed",
            additions: 1,
            deletions: 1,
          },
        ],
      },
      {
        ...validReview.review,
        changedFiles: [
          {
            path: "src/example.ts",
            status: "modified",
            additions: -1,
            deletions: 0,
          },
        ],
      },
    ]) {
      assert.equal(parseCandidateReviewResponse({ reviewed: true, review }), null);
    }
  });

  it("rejects malformed top-level responses", () => {
    for (const value of [null, {}, { reviewed: "yes" }, { reviewed: false }]) {
      assert.equal(parseCandidateReviewResponse(value), null);
    }
  });
});
