import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ProjectNextReport } from "../shared/project-next.js";
import type { LoopCliNextClient } from "../main/cli-next-client.js";
import { ProjectNextGateway } from "../main/project-next-gateway.js";

function report(name: string): ProjectNextReport {
  return {
    schemaVersion: 1,
    project: { name, type: "cli", path: `/tmp/${name}` },
    git: {},
    roadmap: { selectedCandidate: null },
    validation: {},
    health: "good",
  };
}

class RecordingClient implements LoopCliNextClient {
  calls = 0;
  shouldFail = false;
  private resolvers: Array<() => void> = [];

  async loadProjectNext(
    _repoPath: string,
    projectName: string,
  ): Promise<ProjectNextReport> {
    this.calls += 1;
    await new Promise<void>((resolve) => this.resolvers.push(resolve));
    if (this.shouldFail) {
      throw new Error("boom");
    }
    return report(projectName);
  }

  releaseOne(): void {
    this.resolvers.shift()?.();
  }

  failNext(): void {
    this.shouldFail = true;
  }
}

describe("ProjectNextGateway", () => {
  it("caches a resolved report per project and calls the client only once", async () => {
    const client = new RecordingClient();
    const gateway = new ProjectNextGateway(client, "/tmp/repo");

    const first = gateway.load("loop-engine");
    client.releaseOne();
    const firstReport = await first;

    const second = await gateway.load("loop-engine");

    assert.equal(client.calls, 1);
    assert.equal(second, firstReport);
  });

  it("coalesces concurrent requests for the same project into a single call", async () => {
    const client = new RecordingClient();
    const gateway = new ProjectNextGateway(client, "/tmp/repo");

    const a = gateway.load("loop-engine");
    const b = gateway.load("loop-engine");
    client.releaseOne();

    const [reportA, reportB] = await Promise.all([a, b]);

    assert.equal(client.calls, 1);
    assert.equal(reportA, reportB);
  });

  it("does not cache a failed request, so retry re-invokes the client", async () => {
    const client = new RecordingClient();
    const gateway = new ProjectNextGateway(client, "/tmp/repo");

    client.failNext();
    const failing = gateway.load("loop-engine");
    client.releaseOne();
    await assert.rejects(() => failing, /boom/);

    client.shouldFail = false;
    const retry = gateway.load("loop-engine");
    client.releaseOne();
    const value = await retry;

    assert.equal(client.calls, 2);
    assert.equal(value.project.name, "loop-engine");
  });

  it("caches independently per project name", async () => {
    const client = new RecordingClient();
    const gateway = new ProjectNextGateway(client, "/tmp/repo");

    const a = gateway.load("creatyss");
    client.releaseOne();
    await a;

    const b = gateway.load("n8n");
    client.releaseOne();
    await b;

    assert.equal(client.calls, 2);
  });

  it("rejects an empty project name without invoking the client", async () => {
    const client = new RecordingClient();
    const gateway = new ProjectNextGateway(client, "/tmp/repo");

    await assert.rejects(
      () => gateway.load(""),
      /projectName must be a non-empty string/,
    );

    assert.equal(client.calls, 0);
  });
});
