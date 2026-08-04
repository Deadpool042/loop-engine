import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ProjectSectionGateway } from "../main/project-section-gateway.js";

class RecordingLoader {
  calls = 0;
  shouldFail = false;
  private resolvers: Array<() => void> = [];

  load = async (projectName: string): Promise<{ project: string }> => {
    this.calls += 1;
    await new Promise<void>((resolve) => this.resolvers.push(resolve));
    if (this.shouldFail) {
      throw new Error("boom");
    }
    return { project: projectName };
  };

  releaseOne(): void {
    this.resolvers.shift()?.();
  }

  failNext(): void {
    this.shouldFail = true;
  }
}

describe("ProjectSectionGateway", () => {
  it("caches a resolved value per project and calls the loader only once", async () => {
    const loader = new RecordingLoader();
    const gateway = new ProjectSectionGateway(loader.load);

    const first = gateway.load("loop-engine");
    loader.releaseOne();
    const firstValue = await first;

    const second = await gateway.load("loop-engine");

    assert.equal(loader.calls, 1);
    assert.equal(second, firstValue);
  });

  it("coalesces concurrent requests for the same project into a single call", async () => {
    const loader = new RecordingLoader();
    const gateway = new ProjectSectionGateway(loader.load);

    const a = gateway.load("loop-engine");
    const b = gateway.load("loop-engine");
    loader.releaseOne();

    const [valueA, valueB] = await Promise.all([a, b]);

    assert.equal(loader.calls, 1);
    assert.equal(valueA, valueB);
  });

  it("does not cache a failed request, so retry re-invokes the loader", async () => {
    const loader = new RecordingLoader();
    const gateway = new ProjectSectionGateway(loader.load);

    loader.failNext();
    const failing = gateway.load("loop-engine");
    loader.releaseOne();
    await assert.rejects(() => failing, /boom/);

    loader.shouldFail = false;
    const retry = gateway.load("loop-engine");
    loader.releaseOne();
    const value = await retry;

    assert.equal(loader.calls, 2);
    assert.equal(value.project, "loop-engine");
  });

  it("caches independently per project name", async () => {
    const loader = new RecordingLoader();
    const gateway = new ProjectSectionGateway(loader.load);

    const a = gateway.load("creatyss");
    loader.releaseOne();
    await a;

    const b = gateway.load("n8n");
    loader.releaseOne();
    await b;

    assert.equal(loader.calls, 2);
  });

  it("rejects an empty project name without invoking the loader", async () => {
    const loader = new RecordingLoader();
    const gateway = new ProjectSectionGateway(loader.load);

    await assert.rejects(
      () => gateway.load(""),
      /projectName must be a non-empty string/,
    );

    assert.equal(loader.calls, 0);
  });

  it("invalidate forces the next load to re-invoke the loader (explicit refresh)", async () => {
    const loader = new RecordingLoader();
    const gateway = new ProjectSectionGateway(loader.load);

    const first = gateway.load("loop-engine");
    loader.releaseOne();
    await first;

    gateway.invalidate("loop-engine");

    const second = gateway.load("loop-engine");
    loader.releaseOne();
    await second;

    assert.equal(loader.calls, 2);
  });

  it("invalidate does not affect other projects' cached values", async () => {
    const loader = new RecordingLoader();
    const gateway = new ProjectSectionGateway(loader.load);

    const a = gateway.load("creatyss");
    loader.releaseOne();
    await a;

    gateway.invalidate("n8n");

    const cached = await gateway.load("creatyss");

    assert.equal(loader.calls, 1);
    assert.equal(cached.project, "creatyss");
  });

  it("invalidate rejects an empty project name", () => {
    const loader = new RecordingLoader();
    const gateway = new ProjectSectionGateway(loader.load);

    assert.throws(
      () => gateway.invalidate(""),
      /projectName must be a non-empty string/,
    );
  });
});
