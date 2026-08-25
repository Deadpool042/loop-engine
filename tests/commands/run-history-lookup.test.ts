import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generateRunHistoryLookupReport } from "../../src/commands/run-history-lookup.js";
import type { LoopApplicationAssembly } from "../../src/composition/index.js";
import type { LoopRunResult } from "../../src/loop/types.js";

const entry: LoopRunResult = {
  schemaVersion: 1,
  runId: "run-old",
  project: "loop-engine",
  mode: "publish",
  status: "completed",
  startedAt: "2026-08-25T10:00:00.000Z",
  completedAt: "2026-08-25T10:01:00.000Z",
  candidate: null,
  steps: [],
  validation: null,
  modifiedFiles: [],
  commit: null,
  publication: null,
  failure: null,
  agentPolicy: null,
  contextPackage: null,
};

type LookupApplication = Pick<LoopApplicationAssembly, "lookupRunHistoryEntry">;

describe("exact run history lookup command report", () => {
  it("projects one exact persisted run independently of recent-history limits", () => {
    const application: LookupApplication = {
      lookupRunHistoryEntry(project, runId) {
        assert.equal(project, "loop-engine");
        assert.equal(runId, "run-old");
        return { found: true, entry, corruptedLines: 2 };
      },
    };

    assert.deepEqual(
      generateRunHistoryLookupReport(application, "loop-engine", "run-old"),
      {
        schemaVersion: 1,
        project: "loop-engine",
        runId: "run-old",
        found: true,
        entry,
        corruptedLines: 2,
      },
    );
  });

  it("preserves fail-closed lookup outcomes", () => {
    for (const code of [
      "not_found",
      "duplicate_run_id",
      "invalid_project_identity",
      "read_failed",
    ] as const) {
      const application: LookupApplication = {
        lookupRunHistoryEntry: () => ({
          found: false,
          code,
          corruptedLines: 3,
        }),
      };
      assert.deepEqual(
        generateRunHistoryLookupReport(application, "loop-engine", "run-old"),
        {
          schemaVersion: 1,
          project: "loop-engine",
          runId: "run-old",
          found: false,
          code,
          corruptedLines: 3,
        },
      );
    }
  });
});
