import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DefaultLoopCliPlanClient } from "../main/cli-plan-client.js";
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

function validReport(): string {
  return JSON.stringify({
    schemaVersion: 1,
    runId: "11111111-1111-1111-1111-111111111111",
    project: "loop-engine",
    mode: "plan",
    status: "completed",
    modifiedFiles: [],
    candidate: null,
    steps: [],
    validation: null,
    commit: null,
    publication: null,
    failure: null,
  });
}

describe("DefaultLoopCliPlanClient", () => {
  it("executes only the fixed run --mode plan JSON command, no arbitrary arguments", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: validReport(),
      stderr: "",
    });

    const client = new DefaultLoopCliPlanClient(runner);
    const report = await client.loadProjectPlan(
      "/tmp/loop-engine",
      "loop-engine",
    );

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.mode, "plan");
    assert.ok(Array.isArray(report.modifiedFiles));
    assert.equal(runner.requests.length, 1);
    assert.deepEqual(runner.requests[0]?.args, [
      "src/cli.ts",
      "run",
      "loop-engine",
      "--mode",
      "plan",
      "--json",
    ]);
  });

  it("rejects an empty repo path without invoking the runner", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: validReport(),
      stderr: "",
    });

    const client = new DefaultLoopCliPlanClient(runner);

    await assert.rejects(
      () => client.loadProjectPlan(" ", "loop-engine"),
      /repoPath must be a non-empty string/,
    );

    assert.equal(runner.requests.length, 0);
  });

  it("rejects an empty project name without invoking the runner", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: validReport(),
      stderr: "",
    });

    const client = new DefaultLoopCliPlanClient(runner);

    await assert.rejects(
      () => client.loadProjectPlan("/tmp/loop-engine", " "),
      /projectName must be a non-empty string/,
    );

    assert.equal(runner.requests.length, 0);
  });

  it("rejects invalid JSON", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: "not-json",
      stderr: "",
    });

    const client = new DefaultLoopCliPlanClient(runner);

    await assert.rejects(
      () => client.loadProjectPlan("/tmp/loop-engine", "loop-engine"),
      /invalid JSON/,
    );
  });

  it("rejects a valid JSON payload that does not match the schemaVersion 1 plan contract", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: JSON.stringify({ schemaVersion: 1, project: "loop-engine" }),
      stderr: "",
    });

    const client = new DefaultLoopCliPlanClient(runner);

    await assert.rejects(
      () => client.loadProjectPlan("/tmp/loop-engine", "loop-engine"),
      /invalid schemaVersion 1 plan contract/,
    );
  });

  it("rejects a payload whose mode is not plan", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: JSON.stringify({
        schemaVersion: 1,
        runId: "x",
        project: "loop-engine",
        mode: "execute",
        status: "completed",
        modifiedFiles: [],
      }),
      stderr: "",
    });

    const client = new DefaultLoopCliPlanClient(runner);

    await assert.rejects(
      () => client.loadProjectPlan("/tmp/loop-engine", "loop-engine"),
      /invalid schemaVersion 1 plan contract/,
    );
  });

  it("rejects a payload whose modifiedFiles is not an array", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: JSON.stringify({
        schemaVersion: 1,
        runId: "x",
        project: "loop-engine",
        mode: "plan",
        status: "completed",
        modifiedFiles: "none",
      }),
      stderr: "",
    });

    const client = new DefaultLoopCliPlanClient(runner);

    await assert.rejects(
      () => client.loadProjectPlan("/tmp/loop-engine", "loop-engine"),
      /invalid schemaVersion 1 plan contract/,
    );
  });

  it("rejects a non-zero CLI exit", async () => {
    const runner = new FakeRunner({
      exitCode: 1,
      stdout: "",
      stderr: "unknown project",
    });

    const client = new DefaultLoopCliPlanClient(runner);

    await assert.rejects(
      () => client.loadProjectPlan("/tmp/loop-engine", "missing"),
      /unknown project/,
    );
  });
});
