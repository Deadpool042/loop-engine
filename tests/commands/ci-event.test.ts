import assert from "node:assert/strict";
import test from "node:test";

import { recordCiTerminalEventCommand } from "../../src/commands/ci-event.js";
import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../../src/composition/index.js";
import type { CiTerminalEventRecord } from "../../src/core/ci-terminal-events.js";

const PROJECT = {
  name: "creatyss",
  path: "../CREATYSS",
  type: "next-prisma",
  required_docs: [],
  validation: [],
  repository: "Deadpool042/CREATYSS",
} as LoopApplicationProject;

function recordingApplication(
  write: (record: CiTerminalEventRecord) => void,
): LoopApplicationAssembly {
  return {
    recordCiTerminalEvent(record: CiTerminalEventRecord) {
      write(record);
      return { ok: true, path: "/tmp/ignored" };
    },
  } as unknown as LoopApplicationAssembly;
}

test("derives repository/run URL from canonical project configuration", () => {
  let written: CiTerminalEventRecord | null = null;
  const application = recordingApplication((record) => {
    written = record;
  });

  const report = recordCiTerminalEventCommand(
    application,
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
  const application = recordingApplication(() => {
    throw new Error("must not write");
  });

  assert.throws(
    () =>
      recordCiTerminalEventCommand(
        application,
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
