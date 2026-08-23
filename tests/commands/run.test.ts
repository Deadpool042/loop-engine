import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { runLoopRunCommand } from "../../src/commands/run.js";
import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../../src/composition/index.js";
import type { LoopRunResult } from "../../src/loop/types.js";

const FIXTURE_PROJECT: LoopApplicationProject = {
  name: "run-history-write-failure-fixture",
  path: ".",
  type: "generic",
  required_docs: [],
  validation: [],
};

function fixtureCompletedResult(): LoopRunResult {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId: randomUUID(),
    project: FIXTURE_PROJECT.name,
    mode: "plan",
    status: "completed",
    startedAt: timestamp,
    completedAt: timestamp,
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
}

/**
 * A minimal fake `LoopApplicationAssembly` exercising only the members
 * `runLoopRunCommand` actually reads for mode "plan": `runLoopPlan`,
 * `recordLoopRunHistory`, and `generateExecutionReport`. Every other field
 * is intentionally absent -- calling it would be a test bug, not a
 * production path -- hence the cast.
 */
function fakeApplication(
  recordLoopRunHistory: LoopApplicationAssembly["recordLoopRunHistory"],
): LoopApplicationAssembly {
  return {
    runLoopPlan: () => fixtureCompletedResult(),
    recordLoopRunHistory,
    generateExecutionReport: (result: LoopRunResult) => result,
  } as unknown as LoopApplicationAssembly;
}

function captureConsoleLog(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return {
    lines,
    restore: () => {
      console.log = original;
    },
  };
}

function captureStderrWrites(): {
  writes: string[];
  restore: () => void;
} {
  const writes: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    writes.push(chunk.toString());
    return true;
  }) as typeof process.stderr.write;
  return {
    writes,
    restore: () => {
      process.stderr.write = original;
    },
  };
}

describe("run command — non-silent run history write failure", () => {
  it("text mode: warns without turning a successful run into a failure", async () => {
    const application = fakeApplication(() => ({
      written: false,
      ok: false,
      code: "write_failed",
      message: "simulated disk failure",
    }));

    const log = captureConsoleLog();
    let exitCode: number;
    try {
      exitCode = await runLoopRunCommand(
        application,
        FIXTURE_PROJECT,
        "plan",
        false,
      );
    } finally {
      log.restore();
    }

    assert.equal(exitCode, 0);
    const warningLine = log.lines.find((line) =>
      line.includes("Run history not recorded"),
    );
    assert.ok(warningLine, "expected a non-silent run history warning");
    assert.ok(warningLine?.includes("write_failed"));
    assert.ok(warningLine?.includes("simulated disk failure"));
  });

  it("json mode: reports the failure on stderr as LOOP_RUN_HISTORY_WRITE_FAILED without corrupting stdout JSON", async () => {
    const application = fakeApplication(() => ({
      written: false,
      ok: false,
      code: "write_failed",
      message: "simulated disk failure",
    }));

    const log = captureConsoleLog();
    const stderr = captureStderrWrites();
    let exitCode: number;
    try {
      exitCode = await runLoopRunCommand(
        application,
        FIXTURE_PROJECT,
        "plan",
        true,
      );
    } finally {
      log.restore();
      stderr.restore();
    }

    assert.equal(exitCode, 0);

    // stdout must remain exactly one parsable JSON payload: the failure
    // signal must never leak into it.
    assert.equal(log.lines.length, 1);
    assert.doesNotThrow(() => JSON.parse(log.lines[0] as string));

    const failureLine = stderr.writes.find((line) =>
      line.startsWith("LOOP_RUN_HISTORY_WRITE_FAILED:"),
    );
    assert.ok(failureLine, "expected a non-silent stderr failure signal");
    const detail = JSON.parse(
      (failureLine as string).slice("LOOP_RUN_HISTORY_WRITE_FAILED:".length),
    ) as { code?: unknown; message?: unknown };
    assert.equal(detail.code, "write_failed");
    assert.equal(detail.message, "simulated disk failure");
  });

  it("does not warn when the history write succeeds", async () => {
    const application = fakeApplication(() => ({
      written: true,
      ok: true,
    }));

    const log = captureConsoleLog();
    let exitCode: number;
    try {
      exitCode = await runLoopRunCommand(
        application,
        FIXTURE_PROJECT,
        "plan",
        false,
      );
    } finally {
      log.restore();
    }

    assert.equal(exitCode, 0);
    assert.equal(
      log.lines.some((line) => line.includes("Run history not recorded")),
      false,
    );
  });
});
