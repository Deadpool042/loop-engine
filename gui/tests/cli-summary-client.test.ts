import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DefaultLoopCliSummaryClient,
  type SummaryProcessRequest,
  type SummaryProcessRunner,
} from "../main/cli-summary-client.js";

class FakeRunner implements SummaryProcessRunner {
  readonly requests: SummaryProcessRequest[] = [];

  constructor(private readonly result: {
    exitCode: number;
    stdout: string;
    stderr: string;
  }) {}

  async run(request: SummaryProcessRequest) {
    this.requests.push(request);
    return this.result;
  }
}

describe("DefaultLoopCliSummaryClient", () => {
  it("executes only the fixed summary JSON command", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: JSON.stringify({ schemaVersion: 1, projects: [] }),
      stderr: "",
    });
    const client = new DefaultLoopCliSummaryClient(runner);

    const result = await client.loadWorkspaceSummary("/tmp/loop-engine");

    assert.deepEqual(result, { schemaVersion: 1, projects: [] });
    assert.equal(runner.requests.length, 1);
    assert.equal(runner.requests[0]?.cwd, "/tmp/loop-engine");
    assert.deepEqual(runner.requests[0]?.args, [
      "src/cli.ts",
      "summary",
      "--json",
    ]);
    assert.match(
      runner.requests[0]?.executable ?? "",
      /node_modules\/\.bin\/tsx$/,
    );
  });

  it("rejects an empty repository path without invoking the runner", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
    const client = new DefaultLoopCliSummaryClient(runner);

    await assert.rejects(
      () => client.loadWorkspaceSummary("   "),
      /repoPath must be a non-empty string/,
    );
    assert.equal(runner.requests.length, 0);
  });

  it("rejects a non-zero CLI exit using stderr", async () => {
    const runner = new FakeRunner({
      exitCode: 1,
      stdout: "",
      stderr: "configuration missing",
    });
    const client = new DefaultLoopCliSummaryClient(runner);

    await assert.rejects(
      () => client.loadWorkspaceSummary("/tmp/loop-engine"),
      /configuration missing/,
    );
  });

  it("rejects invalid JSON", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: "not-json",
      stderr: "",
    });
    const client = new DefaultLoopCliSummaryClient(runner);

    await assert.rejects(
      () => client.loadWorkspaceSummary("/tmp/loop-engine"),
      /invalid JSON/,
    );
  });

  it("rejects an unsupported summary contract", async () => {
    const runner = new FakeRunner({
      exitCode: 0,
      stdout: JSON.stringify({ schemaVersion: 2, projects: [] }),
      stderr: "",
    });
    const client = new DefaultLoopCliSummaryClient(runner);

    await assert.rejects(
      () => client.loadWorkspaceSummary("/tmp/loop-engine"),
      /invalid schemaVersion 1 contract/,
    );
  });
});
