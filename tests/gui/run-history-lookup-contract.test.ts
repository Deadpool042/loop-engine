import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatRunHistoryLookupFailure,
  parseRunHistoryLookupResponse,
} from "../../src/gui/desktop/run-history-lookup-contract.js";

const entry = {
  schemaVersion: 1,
  runId: "run-old",
  project: "loop-engine",
  mode: "publish",
  status: "completed",
  startedAt: "2026-08-25T10:00:00.000Z",
  completedAt: "2026-08-25T10:01:00.000Z",
  candidate: { id: "V33" },
  steps: [],
  validation: null,
  modifiedFiles: [],
  commit: null,
  publication: null,
  failure: null,
  agentPolicy: null,
  contextPackage: null,
};

describe("run history lookup desktop contract", () => {
  it("projects one exact run entry", () => {
    assert.deepEqual(
      parseRunHistoryLookupResponse({
        schemaVersion: 1,
        project: "loop-engine",
        runId: "run-old",
        found: true,
        entry,
        corruptedLines: 2,
      }),
      {
        found: true,
        project: "loop-engine",
        runId: "run-old",
        corruptedLines: 2,
        entry: {
          runId: "run-old",
          mode: "publish",
          status: "completed",
          startedAt: "2026-08-25T10:00:00.000Z",
          completedAt: "2026-08-25T10:01:00.000Z",
          candidateId: "V33",
          executionResult: null,
        },
      },
    );
  });

  it("projects closed lookup failures", () => {
    for (const code of [
      "not_found",
      "duplicate_run_id",
      "invalid_project_identity",
      "read_failed",
    ] as const) {
      const parsed = parseRunHistoryLookupResponse({
        schemaVersion: 1,
        project: "loop-engine",
        runId: "run-old",
        found: false,
        code,
        corruptedLines: 0,
      });
      assert.equal(parsed?.found, false);
      assert.equal(formatRunHistoryLookupFailure(code).length > 0, true);
    }
  });

  it("fails closed on mismatched run identity or malformed failure code", () => {
    assert.equal(
      parseRunHistoryLookupResponse({
        schemaVersion: 1,
        project: "loop-engine",
        runId: "other-run",
        found: true,
        entry,
        corruptedLines: 0,
      }),
      null,
    );
    assert.equal(
      parseRunHistoryLookupResponse({
        schemaVersion: 1,
        project: "loop-engine",
        runId: "run-old",
        found: false,
        code: "unknown",
        corruptedLines: 0,
      }),
      null,
    );
  });
});
