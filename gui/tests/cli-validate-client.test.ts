import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DefaultLoopCliValidateClient } from "../main/cli-validate-client.js";
import type {
  ProcessRequest,
  ProcessRunner,
  ProcessResult,
} from "../main/process-runner.js";

class FakeRunner implements ProcessRunner {
  readonly requests: ProcessRequest[] = [];

  constructor(private readonly result: ProcessResult) {}

  async run(request: ProcessRequest): Promise<ProcessResult> {
    this.requests.push(request);
    return this.result;
  }
}

describe("DefaultLoopCliValidateClient", () => {
  it("executes only the fixed validate command, never --mode execute", async () => {
    const runner = new FakeRunner({ exitCode: 0, stdout: "", stderr: "" });
    const client = new DefaultLoopCliValidateClient(runner);

    await client.validateProject("/tmp/loop-engine", "loop-engine");

    assert.equal(runner.requests.length, 1);
    assert.deepEqual(runner.requests[0]?.args, [
      "src/cli.ts",
      "validate",
      "loop-engine",
    ]);
    assert.equal(
      runner.requests[0]?.args.some((arg) => arg === "execute"),
      false,
    );
  });

  it("rejects an empty repo path without invoking the runner", async () => {
    const runner = new FakeRunner({ exitCode: 0, stdout: "", stderr: "" });
    const client = new DefaultLoopCliValidateClient(runner);

    await assert.rejects(
      () => client.validateProject(" ", "loop-engine"),
      /repoPath must be a non-empty string/,
    );

    assert.equal(runner.requests.length, 0);
  });

  it("rejects an empty project name without invoking the runner", async () => {
    const runner = new FakeRunner({ exitCode: 0, stdout: "", stderr: "" });
    const client = new DefaultLoopCliValidateClient(runner);

    await assert.rejects(
      () => client.validateProject("/tmp/loop-engine", " "),
      /projectName must be a non-empty string/,
    );

    assert.equal(runner.requests.length, 0);
  });

  it("rejects on a non-zero exit code with the CLI's stderr", async () => {
    const runner = new FakeRunner({
      exitCode: 1,
      stdout: "",
      stderr: "validation failed: typecheck",
    });
    const client = new DefaultLoopCliValidateClient(runner);

    await assert.rejects(
      () => client.validateProject("/tmp/loop-engine", "loop-engine"),
      /validation failed: typecheck/,
    );
  });

  it("resolves without a value on success", async () => {
    const runner = new FakeRunner({ exitCode: 0, stdout: "ok", stderr: "" });
    const client = new DefaultLoopCliValidateClient(runner);

    const result = await client.validateProject(
      "/tmp/loop-engine",
      "loop-engine",
    );

    assert.equal(result, undefined);
  });
});
