import assert from "node:assert/strict";
import { appendFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  generateRunHistoryReport,
  recordLoopRunHistory,
  type LoopRunHistoryReport,
} from "../../src/core/index.js";
import type { LoopRunResult, LoopRunStatus } from "../../src/loop/types.js";

const RUN_HISTORY_DIRECTORY = ".loop-engine/runs";

function fixtureProjectName(): string {
  return `run-history-fixture-${randomUUID()}`;
}

function fixtureResult(
  project: string,
  overrides: Partial<LoopRunResult> = {},
): LoopRunResult {
  const startedAt = overrides.startedAt ?? new Date().toISOString();
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

function journalPath(project: string): string {
  return join(RUN_HISTORY_DIRECTORY, `${project}.jsonl`);
}

function withFixtureProject(run: (project: string) => void): void {
  const project = fixtureProjectName();
  try {
    run(project);
  } finally {
    rmSync(journalPath(project), { force: true });
  }
}

describe("run history evidence store", () => {
  it("records the first terminal run as the first entry", () => {
    withFixtureProject((project) => {
      const result = fixtureResult(project, { status: "completed" });
      const outcome = recordLoopRunHistory(result);
      assert.equal(outcome.ok, true);
      assert.equal(outcome.written, true);

      const report = generateRunHistoryReport(project);
      assert.equal(report.entries.length, 1);
      assert.equal(report.entries[0]?.runId, result.runId);
      assert.equal(report.corruptedLines, 0);
    });
  });

  it("appends subsequent terminal runs without overwriting previous entries", () => {
    withFixtureProject((project) => {
      const first = fixtureResult(project, {
        status: "completed",
        completedAt: "2026-01-01T00:00:00.000Z",
      });
      const second = fixtureResult(project, {
        status: "failed",
        completedAt: "2026-01-02T00:00:00.000Z",
      });
      const third = fixtureResult(project, {
        status: "blocked",
        completedAt: "2026-01-03T00:00:00.000Z",
      });

      for (const result of [first, second, third]) {
        assert.equal(recordLoopRunHistory(result).ok, true);
      }

      const report = generateRunHistoryReport(project);
      assert.equal(report.entries.length, 3);
    });
  });

  it("orders CLI-facing entries most recent first, as the exact reverse of the append-only physical order", () => {
    withFixtureProject((project) => {
      // Realistic usage: runs are always appended in true chronological order.
      const oldest = fixtureResult(project, {
        completedAt: "2026-01-01T00:00:00.000Z",
      });
      const middle = fixtureResult(project, {
        completedAt: "2026-01-02T00:00:00.000Z",
      });
      const newest = fixtureResult(project, {
        completedAt: "2026-01-03T00:00:00.000Z",
      });

      recordLoopRunHistory(oldest);
      recordLoopRunHistory(middle);
      recordLoopRunHistory(newest);

      // Physical append order on disk is never reordered (oldest, middle, newest).
      const rawLines = readFileSync(journalPath(project), "utf8")
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as LoopRunResult);
      assert.deepEqual(
        rawLines.map((entry) => entry.runId),
        [oldest.runId, middle.runId, newest.runId],
      );

      // CLI contract: the exact reverse of the physical append order.
      const report = generateRunHistoryReport(project);
      assert.deepEqual(
        report.entries.map((entry) => entry.runId),
        [newest.runId, middle.runId, oldest.runId],
      );
    });
  });

  it("bounds the read via limit", () => {
    withFixtureProject((project) => {
      for (let index = 0; index < 5; index += 1) {
        recordLoopRunHistory(
          fixtureResult(project, {
            completedAt: `2026-01-0${index + 1}T00:00:00.000Z`,
          }),
        );
      }

      const report = generateRunHistoryReport(project, { limit: 2 });
      assert.equal(report.limit, 2);
      assert.equal(report.entries.length, 2);
      assert.equal(report.entries[0]?.completedAt, "2026-01-05T00:00:00.000Z");
    });
  });

  it("reports an empty, non-corrupted history when no journal exists", () => {
    const project = fixtureProjectName();
    const report = generateRunHistoryReport(project);
    assert.equal(existsSync(journalPath(project)), false);
    assert.deepEqual(report.entries, []);
    assert.equal(report.corruptedLines, 0);
    assert.equal(report.error, undefined);
  });

  it("isolates journals per project", () => {
    const projectA = fixtureProjectName();
    const projectB = fixtureProjectName();
    try {
      recordLoopRunHistory(fixtureResult(projectA));
      recordLoopRunHistory(fixtureResult(projectB));
      recordLoopRunHistory(fixtureResult(projectB));

      assert.equal(generateRunHistoryReport(projectA).entries.length, 1);
      assert.equal(generateRunHistoryReport(projectB).entries.length, 2);
    } finally {
      rmSync(journalPath(projectA), { force: true });
      rmSync(journalPath(projectB), { force: true });
    }
  });

  it("rejects a project identity that could escape the run history scope", () => {
    const maliciousProject = "../../etc/passwd";
    const escapePath = join(
      RUN_HISTORY_DIRECTORY,
      "..",
      "..",
      "etc",
      "passwd.jsonl",
    );

    const outcome = recordLoopRunHistory(fixtureResult(maliciousProject));
    assert.equal(outcome.ok, false);
    assert.equal(outcome.written, false);
    assert.equal(outcome.code, "invalid_project_identity");
    assert.equal(existsSync(escapePath), false);

    const report = generateRunHistoryReport(maliciousProject);
    assert.equal(report.error, "invalid_project_identity");
    assert.deepEqual(report.entries, []);
  });

  it("skips a non-terminal result and never writes it", () => {
    withFixtureProject((project) => {
      const nonTerminalStatuses: LoopRunStatus[] = [
        "idle",
        "planning",
        "ready",
        "executing",
        "validating",
        "repairing",
      ];
      for (const status of nonTerminalStatuses) {
        const outcome = recordLoopRunHistory(
          fixtureResult(project, { status, completedAt: null }),
        );
        assert.equal(outcome.written, false);
        assert.equal(outcome.ok, true);
      }
      assert.equal(existsSync(journalPath(project)), false);
    });
  });

  it("writes exactly one line for one terminal result", () => {
    withFixtureProject((project) => {
      recordLoopRunHistory(fixtureResult(project, { status: "completed" }));
      const raw = readFileSync(journalPath(project), "utf8");
      const lines = raw.split("\n").filter((line) => line.trim().length > 0);
      assert.equal(lines.length, 1);
      assert.doesNotThrow(() => JSON.parse(lines[0] as string));
    });
  });

  it("produces valid JSONL: one parsable JSON object per line", () => {
    withFixtureProject((project) => {
      for (let index = 0; index < 4; index += 1) {
        recordLoopRunHistory(fixtureResult(project));
      }
      const raw = readFileSync(journalPath(project), "utf8");
      const lines = raw.split("\n").filter((line) => line.trim().length > 0);
      assert.equal(lines.length, 4);
      for (const line of lines) {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        assert.equal(parsed.schemaVersion, 1);
      }
    });
  });

  it("surfaces corruption explicitly instead of hiding it", () => {
    withFixtureProject((project) => {
      const valid = fixtureResult(project, { status: "completed" });
      recordLoopRunHistory(valid);

      appendFileSync(journalPath(project), "not json\n", "utf8");
      appendFileSync(
        journalPath(project),
        `${JSON.stringify({ ...valid, schemaVersion: 2, runId: randomUUID() })}\n`,
        "utf8",
      );
      appendFileSync(
        journalPath(project),
        `${JSON.stringify({ ...valid, project: "some-other-project", runId: randomUUID() })}\n`,
        "utf8",
      );

      const report: LoopRunHistoryReport = generateRunHistoryReport(project);
      assert.equal(report.entries.length, 1);
      assert.equal(report.entries[0]?.runId, valid.runId);
      assert.equal(report.corruptedLines, 3);
    });
  });

  it("rejects an unknown schemaVersion instead of trusting it", () => {
    withFixtureProject((project) => {
      appendFileSync(
        journalPath(project),
        `${JSON.stringify({ ...fixtureResult(project), schemaVersion: 99 })}\n`,
        "utf8",
      );
      const report = generateRunHistoryReport(project);
      assert.equal(report.entries.length, 0);
      assert.equal(report.corruptedLines, 1);
    });
  });
});
