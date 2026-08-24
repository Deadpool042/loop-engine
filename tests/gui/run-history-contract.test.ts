import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatRunHistoryStatus,
  parseRunHistoryDetail,
} from "../../src/gui/desktop/run-history-contract.js";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    runId: "run-1",
    project: "loop-engine",
    mode: "execute",
    status: "completed",
    startedAt: "2026-08-24T10:00:00.000Z",
    completedAt: "2026-08-24T10:05:00.000Z",
    candidate: { id: "V28" },
    steps: [],
    validation: {
      status: "passed",
      attempts: 1,
      repairAttempts: 0,
      commands: [],
      failedCommand: null,
      exitCode: 0,
    },
    modifiedFiles: ["src/gui/desktop/app.tsx"],
    commit: null,
    patchExport: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
    ...overrides,
  };
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    project: "loop-engine",
    limit: 20,
    corruptedLines: 0,
    entries: [entry()],
    ...overrides,
  };
}

describe("GUI run history contract", () => {
  it("projects a valid bounded report and reuses V27 execution detail", () => {
    const detail = parseRunHistoryDetail(report());
    assert.equal(detail?.entries[0]?.candidateId, "V28");
    assert.equal(
      detail?.entries[0]?.executionResult?.validation?.status,
      "passed",
    );
  });

  it("accepts every terminal status including cancelled", () => {
    for (const status of ["completed", "failed", "blocked", "cancelled"]) {
      const value =
        status === "cancelled"
          ? entry({
              status,
              validation: null,
              modifiedFiles: [],
              failure: { code: "cancelled", message: "Cancelled", details: [] },
            })
          : entry({
              status,
              ...(status === "completed"
                ? {}
                : {
                    failure: {
                      code: "failure",
                      message: "Failed",
                      details: [],
                    },
                    validation: null,
                  }),
            });
      const detail = parseRunHistoryDetail(report({ entries: [value] }));
      assert.equal(detail?.entries[0]?.status, status);
    }
    assert.equal(formatRunHistoryStatus("cancelled"), "Annulé");
  });

  it("accepts an empty history and surfaces recovered JSONL corruption", () => {
    assert.deepEqual(
      parseRunHistoryDetail(report({ entries: [], corruptedLines: 2 })),
      {
        project: "loop-engine",
        limit: 20,
        corruptedLines: 2,
        entries: [],
      },
    );
  });

  it("fails closed for malformed entries, unknown status or mode, wrong schema and invalid report shape", () => {
    assert.equal(parseRunHistoryDetail(report({ entries: [{}] })), null);
    assert.equal(
      parseRunHistoryDetail(report({ entries: [entry({ status: "ready" })] })),
      null,
    );
    assert.equal(
      parseRunHistoryDetail(report({ entries: [entry({ mode: "unknown" })] })),
      null,
    );
    assert.equal(parseRunHistoryDetail(report({ schemaVersion: 2 })), null);
    assert.equal(
      parseRunHistoryDetail({ schemaVersion: 1, project: "loop-engine" }),
      null,
    );
  });

  it("rejects an entry scoped to another project", () => {
    assert.equal(
      parseRunHistoryDetail(report({ entries: [entry({ project: "other" })] })),
      null,
    );
  });
});
