import assert from "node:assert/strict";
import { appendFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { describe, it } from "node:test";

import { lookupRunHistoryEntry } from "../../src/core/run-history-lookup.js";
import {
  generateRunHistoryReport,
  recordLoopRunHistory,
} from "../../src/core/index.js";
import type { LoopRunResult } from "../../src/loop/types.js";

const RUN_HISTORY_DIRECTORY = ".loop-engine/runs";

function fixtureProjectName(): string {
  return `run-history-lookup-${randomUUID()}`;
}

function journalPath(project: string): string {
  return join(RUN_HISTORY_DIRECTORY, `${project}.jsonl`);
}

function fixtureResult(
  project: string,
  overrides: Partial<LoopRunResult> = {},
): LoopRunResult {
  const startedAt = overrides.startedAt ?? "2026-08-25T00:00:00.000Z";
  return {
    schemaVersion: 1,
    runId: overrides.runId ?? randomUUID(),
    project,
    mode: overrides.mode ?? "plan",
    status: overrides.status ?? "completed",
    startedAt,
    completedAt: overrides.completedAt ?? startedAt,
    candidate: null,
    steps: [],
    validation: null,
    modifiedFiles: [],
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
    ...overrides,
  };
}

function withFixtureProject(run: (project: string) => void): void {
  const project = fixtureProjectName();
  try {
    run(project);
  } finally {
    rmSync(journalPath(project), { force: true });
  }
}

describe("exact run history evidence lookup", () => {
  it("finds an exact run older than the bounded 100-entry recent report", () => {
    withFixtureProject((project) => {
      const target = fixtureResult(project, { runId: "target-run" });
      assert.equal(recordLoopRunHistory(target).ok, true);
      for (let index = 0; index < 125; index += 1) {
        assert.equal(
          recordLoopRunHistory(
            fixtureResult(project, { runId: `newer-run-${index}` }),
          ).ok,
          true,
        );
      }

      const bounded = generateRunHistoryReport(project, { limit: 100 });
      assert.equal(
        bounded.entries.some((entry) => entry.runId === target.runId),
        false,
      );

      const lookup = lookupRunHistoryEntry(project, target.runId);
      assert.equal(lookup.found, true);
      if (!lookup.found) return;
      assert.equal(lookup.entry.runId, target.runId);
      assert.equal(lookup.entry.project, project);
      assert.equal(lookup.corruptedLines, 0);
    });
  });

  it("ignores and counts corrupt lines while retaining the exact valid evidence", () => {
    withFixtureProject((project) => {
      const target = fixtureResult(project, {
        runId: "target-run",
        steps: [
          {
            name: "unicode-boundary",
            status: "completed",
            startedAt: "2026-08-25T00:00:00.000Z",
            completedAt: "2026-08-25T00:00:00.000Z",
            details: [`${"x".repeat(70_000)}évidence`],
          },
        ],
      });
      appendFileSync(journalPath(project), "not json\n", "utf8");
      assert.equal(recordLoopRunHistory(target).ok, true);
      appendFileSync(
        journalPath(project),
        `${JSON.stringify({ ...fixtureResult(project), schemaVersion: 2 })}\n`,
        "utf8",
      );

      const lookup = lookupRunHistoryEntry(project, target.runId);
      assert.equal(lookup.found, true);
      if (!lookup.found) return;
      assert.equal(lookup.entry.steps[0]?.details[0]?.endsWith("évidence"), true);
      assert.equal(lookup.corruptedLines, 2);
    });
  });

  it("bounds an oversized corrupt line and resumes at the next journal entry", () => {
    withFixtureProject((project) => {
      appendFileSync(journalPath(project), `${"x".repeat(1_100_000)}\n`, "utf8");
      const target = fixtureResult(project, { runId: "after-oversized-line" });
      assert.equal(recordLoopRunHistory(target).ok, true);

      const lookup = lookupRunHistoryEntry(project, target.runId);
      assert.equal(lookup.found, true);
      if (!lookup.found) return;
      assert.equal(lookup.entry.runId, target.runId);
      assert.equal(lookup.corruptedLines, 1);
    });
  });

  it("fails closed when the same run id occurs more than once", () => {
    withFixtureProject((project) => {
      const first = fixtureResult(project, { runId: "duplicate-run" });
      const second = fixtureResult(project, { runId: "duplicate-run" });
      recordLoopRunHistory(first);
      recordLoopRunHistory(second);

      assert.deepEqual(lookupRunHistoryEntry(project, "duplicate-run"), {
        found: false,
        code: "duplicate_run_id",
        corruptedLines: 0,
      });
    });
  });

  it("returns not_found without creating a journal and rejects invalid project identity", () => {
    const project = fixtureProjectName();
    assert.deepEqual(lookupRunHistoryEntry(project, "missing-run"), {
      found: false,
      code: "not_found",
      corruptedLines: 0,
    });
    assert.deepEqual(lookupRunHistoryEntry("../../escape", "run"), {
      found: false,
      code: "invalid_project_identity",
      corruptedLines: 0,
    });
  });
});
