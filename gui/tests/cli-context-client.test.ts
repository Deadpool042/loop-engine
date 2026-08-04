import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DefaultLoopCliContextClient } from "../main/cli-context-client.js";
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
    project: {
      name: "loop-engine",
      type: "node-cli",
      path: "/tmp/loop-engine",
    },
    git: {},
    docs: {},
    roadmap: {
      selectedCandidate: null,
    },
    validation: {},
    health: "good",
  });
}

describe("DefaultLoopCliContextClient", () => {
  it("executes only the fixed context JSON command", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: validReport(),
      stderr: "",
    });

    const client = new DefaultLoopCliContextClient(runner);
    const report = await client.loadProjectContext(
      "/tmp/loop-engine",
      "loop-engine",
    );

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.project.name, "loop-engine");
    assert.equal(runner.requests.length, 1);
    assert.deepEqual(runner.requests[0]?.args, [
      "src/cli.ts",
      "context",
      "loop-engine",
      "--json",
    ]);
  });

  it("rejects an empty repo path without invoking the runner", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: validReport(),
      stderr: "",
    });

    const client = new DefaultLoopCliContextClient(runner);

    await assert.rejects(
      () => client.loadProjectContext(" ", "loop-engine"),
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

    const client = new DefaultLoopCliContextClient(runner);

    await assert.rejects(
      () => client.loadProjectContext("/tmp/loop-engine", " "),
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

    const client = new DefaultLoopCliContextClient(runner);

    await assert.rejects(
      () => client.loadProjectContext("/tmp/loop-engine", "loop-engine"),
      /invalid JSON/,
    );
  });

  it("rejects a valid JSON payload that does not match the schemaVersion 1 contract", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: JSON.stringify({ schemaVersion: 1, project: {} }),
      stderr: "",
    });

    const client = new DefaultLoopCliContextClient(runner);

    await assert.rejects(
      () => client.loadProjectContext("/tmp/loop-engine", "loop-engine"),
      /invalid schemaVersion 1 contract/,
    );
  });

  it("rejects a non-zero CLI exit", async () => {
    const runner = new FakeRunner({
      exitCode: 1,
      stdout: "",
      stderr: "unknown project",
    });

    const client = new DefaultLoopCliContextClient(runner);

    await assert.rejects(
      () => client.loadProjectContext("/tmp/loop-engine", "missing"),
      /unknown project/,
    );
  });
});
