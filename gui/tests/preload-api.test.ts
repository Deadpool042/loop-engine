import assert from "node:assert/strict";
import test from "node:test";

import { CHANNELS, KNOWN_CHANNELS } from "../shared/ipc-channels.js";
import { createLoopGuiApi, EXPOSED_API_METHODS, type Bridge } from "../main/preload-api.js";

function fakeBridge(): Bridge & { calls: Array<{ channel: string; args: readonly unknown[] }> } {
  const calls: Array<{ channel: string; args: readonly unknown[] }> = [];
  return {
    calls,
    async invoke(channel, ...args) {
      calls.push({ channel, args });
      return { ok: true, channel, args };
    },
  };
}

test("the exposed API surface is exactly the narrow, named method set", () => {
  const api = createLoopGuiApi(fakeBridge());
  const keys = Object.keys(api).sort();

  assert.deepEqual(keys, [...EXPOSED_API_METHODS].sort());
});

test("no method on the exposed API accepts a raw shell/system command", () => {
  const api = createLoopGuiApi(fakeBridge());

  for (const name of Object.keys(api)) {
    assert.doesNotMatch(
      name.toLowerCase(),
      /exec|spawn|shell|command|run\b/,
      `method name "${name}" looks like a generic command-execution escape hatch`,
    );
  }
});

test("each exposed method maps to a distinct, known IPC channel", () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  void api.getConfig();
  void api.saveRepoPath("/tmp/repo");
  void api.pickRepoDirectory();
  void api.loadWorkspaceSummary();
  void api.loadProjectNext("loop-engine");
  void api.loadProjectContext("loop-engine");
  void api.loadProjectPrompt("loop-engine");
  void api.loadProjectReview("loop-engine");
  void api.loadProjectPlan("loop-engine");
  void api.validateProject("loop-engine");
  void api.openProjectFolder("loop-engine");

  const channelsUsed = bridge.calls.map((c) => c.channel);
  assert.deepEqual(channelsUsed.sort(), Object.values(CHANNELS).sort());
  for (const channel of channelsUsed) {
    assert.ok(KNOWN_CHANNELS.has(channel));
  }
});

test("saveRepoPath forwards exactly one string argument, not an arbitrary payload", () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  void api.saveRepoPath("/tmp/repo");

  const call = bridge.calls.find((c) => c.channel === CHANNELS.saveRepoPath);
  assert.ok(call);
  assert.deepEqual(call.args, ["/tmp/repo"]);
});

test("saveRepoPath rejects a non-string argument before it ever reaches the bridge", async () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  // @ts-expect-error — exercising the runtime guard against a malicious/careless caller
  await assert.rejects(() => api.saveRepoPath(1234), TypeError);
  assert.equal(bridge.calls.length, 0, "the bridge must never see the invalid call");
});

test("loadProjectNext forwards exactly the project name on the dedicated channel", () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  void api.loadProjectNext("loop-engine");

  const call = bridge.calls.find((c) => c.channel === CHANNELS.loadProjectNext);
  assert.ok(call);
  assert.deepEqual(call.args, ["loop-engine"]);
});

test("loadProjectNext rejects an empty project name before it ever reaches the bridge", async () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  await assert.rejects(() => api.loadProjectNext(" "), TypeError);
  assert.equal(bridge.calls.length, 0, "the bridge must never see the invalid call");
});

test("loadProjectContext forwards the project name and refresh flag on the dedicated channel", () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  void api.loadProjectContext("loop-engine");
  void api.loadProjectContext("loop-engine", true);

  const calls = bridge.calls.filter((c) => c.channel === CHANNELS.loadProjectContext);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0]?.args, ["loop-engine", false]);
  assert.deepEqual(calls[1]?.args, ["loop-engine", true]);
});

test("loadProjectContext rejects an empty project name before it ever reaches the bridge", async () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  await assert.rejects(() => api.loadProjectContext(" "), TypeError);
  assert.equal(bridge.calls.length, 0, "the bridge must never see the invalid call");
});

test("loadProjectPrompt forwards the project name and refresh flag on the dedicated channel", () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  void api.loadProjectPrompt("loop-engine");
  void api.loadProjectPrompt("loop-engine", true);

  const calls = bridge.calls.filter((c) => c.channel === CHANNELS.loadProjectPrompt);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0]?.args, ["loop-engine", false]);
  assert.deepEqual(calls[1]?.args, ["loop-engine", true]);
});

test("loadProjectPrompt rejects an empty project name before it ever reaches the bridge", async () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  await assert.rejects(() => api.loadProjectPrompt(" "), TypeError);
  assert.equal(bridge.calls.length, 0, "the bridge must never see the invalid call");
});

test("loadProjectReview forwards the project name and refresh flag on the dedicated channel", () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  void api.loadProjectReview("loop-engine");
  void api.loadProjectReview("loop-engine", true);

  const calls = bridge.calls.filter((c) => c.channel === CHANNELS.loadProjectReview);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0]?.args, ["loop-engine", false]);
  assert.deepEqual(calls[1]?.args, ["loop-engine", true]);
});

test("loadProjectReview rejects an empty project name before it ever reaches the bridge", async () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  await assert.rejects(() => api.loadProjectReview(" "), TypeError);
  assert.equal(bridge.calls.length, 0, "the bridge must never see the invalid call");
});

test("loadProjectPlan forwards the project name and refresh flag on the dedicated channel", () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  void api.loadProjectPlan("loop-engine");
  void api.loadProjectPlan("loop-engine", true);

  const calls = bridge.calls.filter((c) => c.channel === CHANNELS.loadProjectPlan);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0]?.args, ["loop-engine", false]);
  assert.deepEqual(calls[1]?.args, ["loop-engine", true]);
});

test("loadProjectPlan rejects an empty project name before it ever reaches the bridge", async () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  await assert.rejects(() => api.loadProjectPlan(" "), TypeError);
  assert.equal(bridge.calls.length, 0, "the bridge must never see the invalid call");
});

test("validateProject forwards only the project name, no command/args/executable", () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  void api.validateProject("loop-engine");

  const call = bridge.calls.find((c) => c.channel === CHANNELS.validateProject);
  assert.ok(call);
  assert.deepEqual(call.args, ["loop-engine"]);
});

test("validateProject rejects an empty project name before it ever reaches the bridge", async () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  await assert.rejects(() => api.validateProject(" "), TypeError);
  assert.equal(bridge.calls.length, 0, "the bridge must never see the invalid call");
});

test("openProjectFolder forwards only the project name, never a path", () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  void api.openProjectFolder("loop-engine");

  const call = bridge.calls.find((c) => c.channel === CHANNELS.openProjectFolder);
  assert.ok(call);
  assert.deepEqual(call.args, ["loop-engine"]);
});

test("openProjectFolder rejects an empty project name before it ever reaches the bridge", async () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  await assert.rejects(() => api.openProjectFolder(" "), TypeError);
  assert.equal(bridge.calls.length, 0, "the bridge must never see the invalid call");
});

test("read-only methods take no arguments", () => {
  const bridge = fakeBridge();
  const api = createLoopGuiApi(bridge);

  void api.getConfig();
  void api.pickRepoDirectory();
  void api.loadWorkspaceSummary();

  for (const call of bridge.calls) {
    assert.deepEqual(call.args, []);
  }
});
