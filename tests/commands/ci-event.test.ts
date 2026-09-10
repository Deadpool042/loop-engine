import assert from "node:assert/strict";
import test from "node:test";

import { recordCiTerminalEventCommand } from "../../src/commands/ci-event.js";
import type { ProjectConfig } from "../../src/core/config.js";
import type { CiTerminalEventRecord } from "../../src/core/ci-terminal-events.js";

const PROJECT = {
  name: "creatyss",
  path: "../CREATYSS",
  type: "next-prisma",
  required_docs: [],
  validation: [],
  repository: "Deadpool042/CREATYSS",
} satisfies ProjectConfig;

test("derives repository/run URL from canonical project configuration", () => {
  let written: CiTerminalEventRecord | null = null;
  const report = recordCiTerminalEventCommand(
    PROJECT,
    {
      conclusion: "success",
      sha: "a".repeat(40),
      workflow: "CI",
      runId: "123456789",
      runAttempt: 3,
      prNumber: 524,
      branch: "test/m13",
    },
    () => new Date("2026-09-10T12:30:00.000Z"),
    (record) => {
      written = record;
      return { ok: true, path: "/tmp/ignored" };
    },
  );

  assert.equal(report.status, "recorded");
  assert.deepEqual(written, {
    schemaVersion: 1,
    project: "creatyss",
    repository: "Deadpool042/CREATYSS",
    sha: "a".repeat(40),
    conclusion: "success",
    workflow: "CI",
    runId: "123456789",
    runAttempt: 3,
    runUrl: "https://github.com/Deadpool042/CREATYSS/actions/runs/123456789",
    prNumber: 524,
    branch: "test/m13",
    occurredAt: "2026-09-10T12:30:00.000Z",
  });
});

test("refuses projects without a canonical GitHub repository", () => {
  assert.throws(
    () =>
      recordCiTerminalEventCommand(
        { ...PROJECT, repository: undefined },
        {
          conclusion: "failure",
          sha: "b".repeat(40),
          workflow: "CI",
          runId: "1",
          runAttempt: 1,
        },
      ),
    /project_repository_required/,
  );
});
