import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runLoopCliJsonCommand } from "../main/loop-cli-json-command.js";
import { toGuiExecutionError } from "../shared/gui-execution-error.js";
import type {
  ProcessRequest,
  ProcessRunner,
  ProcessResult,
} from "../main/process-runner.js";

class FailingToStartRunner implements ProcessRunner {
  constructor(private readonly error: Error) {}

  async run(_request: ProcessRequest): Promise<ProcessResult> {
    throw this.error;
  }
}

class FixedResultRunner implements ProcessRunner {
  constructor(private readonly result: ProcessResult) {}

  async run(_request: ProcessRequest): Promise<ProcessResult> {
    return this.result;
  }
}

describe("runLoopCliJsonCommand — GuiExecutionError classification", () => {
  it("classifies a spawn failure as process_start_failed and preserves raw details", async () => {
    const runner = new FailingToStartRunner(
      new Error("ENOENT: no such file or directory, spawn tsx"),
    );

    await assert.rejects(
      () =>
        runLoopCliJsonCommand(
          runner,
          "/tmp/loop-engine",
          "loop-engine",
          ["src/cli.ts", "context", "loop-engine", "--json"],
          (raw) => raw,
          "context",
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const guiError = toGuiExecutionError(error);
        assert.equal(guiError.kind, "process_start_failed");
        assert.match(guiError.details, /ENOENT/);
        return true;
      },
    );
  });

  it("classifies a non-zero exit code as process_exit_failed, preserving stderr and exitCode", async () => {
    const runner = new FixedResultRunner({
      exitCode: 3,
      stdout: "",
      stderr: "unknown project",
    });

    await assert.rejects(
      () =>
        runLoopCliJsonCommand(
          runner,
          "/tmp/loop-engine",
          "loop-engine",
          ["src/cli.ts", "context", "loop-engine", "--json"],
          (raw) => raw,
          "context",
        ),
      (error: unknown) => {
        const guiError = toGuiExecutionError(error);
        assert.equal(guiError.kind, "process_exit_failed");
        assert.equal(guiError.details, "unknown project");
        if (guiError.kind === "process_exit_failed") {
          assert.equal(guiError.exitCode, 3);
        }
        return true;
      },
    );
  });

  it("classifies a parse failure (invalid JSON) as invalid_output", async () => {
    const runner = new FixedResultRunner({
      exitCode: 0,
      stdout: "not-json",
      stderr: "",
    });

    await assert.rejects(
      () =>
        runLoopCliJsonCommand(
          runner,
          "/tmp/loop-engine",
          "loop-engine",
          ["src/cli.ts", "context", "loop-engine", "--json"],
          () => {
            throw new Error("Loop CLI context returned invalid JSON");
          },
          "context",
        ),
      (error: unknown) => {
        const guiError = toGuiExecutionError(error);
        assert.equal(guiError.kind, "invalid_output");
        assert.match(guiError.details, /invalid JSON/);
        return true;
      },
    );
  });

  it("preserves substring-matchable raw text for existing plain-regex assertions", async () => {
    const runner = new FixedResultRunner({
      exitCode: 1,
      stdout: "",
      stderr: "unknown project",
    });

    await assert.rejects(
      () =>
        runLoopCliJsonCommand(
          runner,
          "/tmp/loop-engine",
          "missing",
          ["src/cli.ts", "context", "missing", "--json"],
          (raw) => raw,
          "context",
        ),
      /unknown project/,
    );
  });

  it("does not wrap a synchronous input-validation TypeError", async () => {
    const runner = new FixedResultRunner({ exitCode: 0, stdout: "{}", stderr: "" });

    await assert.rejects(
      () =>
        runLoopCliJsonCommand(
          runner,
          " ",
          "loop-engine",
          ["src/cli.ts", "context", "loop-engine", "--json"],
          (raw) => raw,
          "context",
        ),
      TypeError,
    );
  });
});
