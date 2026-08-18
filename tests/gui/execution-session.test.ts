import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";

import {
  createExecutionSessionManager,
  createObservableExecuteCliInvoker,
} from "../../src/gui/desktop/execution-session.js";
import { createExecutionWindowCloseGuard } from "../../src/gui/desktop/execution-window-close-guard.js";
import { startExecutionSessionPolling } from "../../src/gui/desktop/app.js";

const request = {
  projectName: "loop-engine",
  candidateId: "V23.0",
  provider: "codex" as const,
  model: "gpt-5.6-terra",
};

describe("GUI observable execution session", () => {
  it("starts one session, retains ordered public progress, and preserves the final execute result", async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const finalResult = {
      ok: true as const,
      json: { schemaVersion: 1, mode: "execute", status: "completed" },
      exitCode: 0,
    };
    const sessions = createExecutionSessionManager({
      createExecuteHandler(onProgress) {
        return async () => {
          onProgress("preparing");
          onProgress("execution_started");
          await pending;
          onProgress("validation_started");
          onProgress("completed");
          return finalResult;
        };
      },
      generateId: () => "session-1",
    });

    const started = await sessions.start(request);
    assert.equal(started.ok, true);
    if (!started.ok) return;
    assert.deepEqual(
      started.session.events.map((event) => event.type),
      ["session_started", "preparing", "execution_started"],
    );
    assert.deepEqual(await sessions.start(request), {
      ok: false,
      kind: "spawn-error",
      raw: "An execution session is already active.",
    });

    release?.();
    await sessions.waitForCompletion("session-1");
    const completed = sessions.get("session-1");
    assert.deepEqual(
      completed?.events.map((event) => event.type),
      [
        "session_started",
        "preparing",
        "execution_started",
        "validation_started",
        "completed",
      ],
    );
    assert.deepEqual(completed?.result, finalResult);
  });

  it("bounds public event retention and represents a terminal execution error without raw process output", async () => {
    const sessions = createExecutionSessionManager({
      createExecuteHandler(onProgress) {
        return async () => {
          for (let index = 0; index < 8; index += 1) onProgress("preparing");
          return {
            ok: false as const,
            kind: "spawn-error" as const,
            raw: "Execution failed.",
          };
        };
      },
      generateId: () => "session-bounded",
      maxEvents: 3,
    });

    const started = await sessions.start(request);
    assert.equal(started.ok, true);
    await sessions.waitForCompletion("session-bounded");
    const completed = sessions.get("session-bounded");
    assert.equal(completed?.events.length, 3);
    assert.deepEqual(
      completed?.events.map((event) => event.sequence),
      [8, 9, 10],
    );
    assert.deepEqual(
      completed?.events.map((event) => event.type),
      ["preparing", "preparing", "failed"],
    );
    assert.deepEqual(completed?.result, {
      ok: false,
      kind: "spawn-error",
      raw: "Execution failed.",
    });
  });

  it("drops malformed oversized stderr lines while retaining bounded public progress", async () => {
    const child = fakeChild();
    const invoker = createObservableExecuteCliInvoker({
      timeoutMs: 1_000,
      maxStderrRemainderBytes: 128,
      spawnProcess: () => child.process,
      onProgress: (type) => progress.push(type),
    });
    const progress: string[] = [];
    const result = invoker.invoke("run", [], "/trusted");

    child.stderr.emit("data", "x".repeat(256));
    child.stderr.emit(
      "data",
      `\n${"LOOP_EXECUTION_EVENT:"}${"x".repeat(256)}\n`,
    );
    child.stderr.emit(
      "data",
      '\nLOOP_EXECUTION_EVENT:{"status":"executing"}\n',
    );
    child.stdout.emit("data", '{"schemaVersion":1}');
    child.process.emit("close", 0);

    assert.deepEqual(await result, {
      ok: true,
      json: { schemaVersion: 1 },
      exitCode: 0,
    });
    assert.deepEqual(progress, ["execution_started"]);
  });

  it("enforces the stdout cap in UTF-8 bytes and only settles after the child closes", async () => {
    const child = fakeChild();
    const invoker = createObservableExecuteCliInvoker({
      timeoutMs: 1_000,
      maxJsonBytes: 4,
      spawnProcess: () => child.process,
      onProgress: () => {},
    });
    const pending = invoker.invoke("run", [], "/trusted");
    child.stdout.emit("data", "ééé");
    assert.deepEqual(child.kills, ["SIGTERM"]);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(settled, false);
    child.process.emit("close", null);
    assert.deepEqual(await pending, {
      ok: false,
      kind: "spawn-error",
      raw: "CLI returned an oversized JSON result.",
    });
  });

  it("keeps the close guard active after timeout until the child termination is confirmed", async () => {
    const child = fakeChild();
    const invoker = createObservableExecuteCliInvoker({
      timeoutMs: 5,
      terminationGraceMs: 5,
      spawnProcess: () => child.process,
      onProgress: () => {},
    });
    const guard = createExecutionWindowCloseGuard();
    const running = guard.run(() => invoker.invoke("run", [], "/trusted"));

    await new Promise((resolve) => setTimeout(resolve, 8));
    assert.equal(guard.active, true);
    assert.deepEqual(child.kills, ["SIGTERM"]);
    child.process.emit("close", null);
    assert.deepEqual(await running, {
      ok: false,
      kind: "spawn-error",
      raw: "CLI invocation timed out.",
    });
    assert.equal(guard.active, false);
  });

  it("fails closed after SIGKILL when child closure cannot be confirmed within the final bound", async () => {
    const child = fakeChild();
    const invoker = createObservableExecuteCliInvoker({
      timeoutMs: 5,
      terminationGraceMs: 5,
      terminationFinalGraceMs: 50,
      spawnProcess: () => child.process,
      onProgress: () => {},
    });
    const guard = createExecutionWindowCloseGuard();
    const running = guard.run(() => invoker.invoke("run", [], "/trusted"));

    await new Promise((resolve) => setTimeout(resolve, 8));
    assert.equal(guard.active, true);
    assert.deepEqual(child.kills, ["SIGTERM"]);
    await new Promise((resolve) => setTimeout(resolve, 8));
    assert.equal(guard.active, true);
    assert.deepEqual(child.kills, ["SIGTERM", "SIGKILL"]);
    assert.deepEqual(await running, {
      ok: false,
      kind: "spawn-error",
      raw: "CLI process termination could not be confirmed.",
    });
    assert.equal(guard.active, false);
  });

  it("polls one session only on its cadence, never overlaps requests, and stops after a terminal snapshot", async () => {
    let tick: (() => void) | undefined;
    let cleared = 0;
    let requests = 0;
    let release: ((session: ReturnType<typeof session>) => void) | undefined;
    const pending = new Promise<ReturnType<typeof session>>((resolve) => {
      release = resolve;
    });
    const seen: string[] = [];
    const stop = startExecutionSessionPolling({
      sessionId: "poll-session",
      fetchSession: async () => {
        requests += 1;
        return requests === 1
          ? pending
          : session({ ok: true, json: {}, exitCode: 0 });
      },
      onSession: (current) => {
        seen.push(current.id);
      },
      setIntervalFn: (callback, delayMs) => {
        assert.equal(delayMs, 750);
        tick = callback;
        return 42;
      },
      clearIntervalFn: (timer) => {
        assert.equal(timer, 42);
        cleared += 1;
      },
    });

    assert.equal(requests, 0);
    tick?.();
    tick?.();
    assert.equal(requests, 1);
    release?.(session(null));
    await new Promise((resolve) => setTimeout(resolve, 0));
    tick?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(requests, 2);
    assert.deepEqual(seen, ["poll-session", "poll-session"]);
    assert.equal(cleared, 1);
    tick?.();
    assert.equal(requests, 2);
    stop();
    assert.equal(cleared, 2);
  });
});

function fakeChild() {
  const process = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: (signal: string) => boolean;
  };
  process.stdout = new EventEmitter();
  process.stderr = new EventEmitter();
  const kills: string[] = [];
  process.kill = (signal) => {
    kills.push(signal);
    return true;
  };
  return { process, stderr: process.stderr, stdout: process.stdout, kills };
}

function session(result: { ok: true; json: unknown; exitCode: number } | null) {
  return {
    id: "poll-session",
    request,
    events: [],
    result,
  };
}
