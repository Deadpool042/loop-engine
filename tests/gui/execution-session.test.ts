import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";

import {
  createExecutionSessionManager,
  createObservableExecuteCliInvoker,
} from "../../src/gui/desktop/execution-session.js";
import { createExecutionWindowCloseGuard } from "../../src/gui/desktop/execution-window-close-guard.js";
import {
  canCancelExecution,
  startExecutionSessionPolling,
} from "../../src/gui/desktop/app.js";

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
        return {
          handler: async () => {
            onProgress("preparing");
            onProgress("execution_started");
            await pending;
            onProgress("validation_started");
            onProgress("completed");
            return finalResult;
          },
          cancel: () => false,
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
        return {
          handler: async () => {
            for (let index = 0; index < 8; index += 1) onProgress("preparing");
            return {
              ok: false as const,
              kind: "spawn-error" as const,
              raw: "Execution failed.",
            };
          },
          cancel: () => false,
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

  it("cancels an active invocation via the same SIGTERM path and confirms it as a distinct cancelled outcome", async () => {
    const child = fakeChild();
    const invoker = createObservableExecuteCliInvoker({
      timeoutMs: 60_000,
      terminationGraceMs: 5,
      spawnProcess: () => child.process,
      onProgress: () => {},
    });
    const pending = invoker.invoke("run", [], "/trusted");

    assert.equal(invoker.cancel(), true);
    assert.deepEqual(child.kills, ["SIGTERM"]);
    child.process.emit("close", null);
    assert.deepEqual(await pending, {
      ok: false,
      kind: "cancelled",
      raw: "CLI invocation was cancelled.",
    });
  });

  it("escalates a cancellation to SIGKILL, reusing the timeout termination grace, when the process ignores SIGTERM", async () => {
    const child = fakeChild();
    const invoker = createObservableExecuteCliInvoker({
      timeoutMs: 60_000,
      terminationGraceMs: 5,
      spawnProcess: () => child.process,
      onProgress: () => {},
    });
    const pending = invoker.invoke("run", [], "/trusted");

    invoker.cancel();
    await new Promise((resolve) => setTimeout(resolve, 8));
    assert.deepEqual(child.kills, ["SIGTERM", "SIGKILL"]);
    child.process.emit("close", null);
    assert.deepEqual(await pending, {
      ok: false,
      kind: "cancelled",
      raw: "CLI invocation was cancelled.",
    });
  });

  it("treats a repeated cancellation request as a no-op once one is already in flight", async () => {
    const child = fakeChild();
    const invoker = createObservableExecuteCliInvoker({
      timeoutMs: 60_000,
      terminationGraceMs: 5_000,
      spawnProcess: () => child.process,
      onProgress: () => {},
    });
    const pending = invoker.invoke("run", [], "/trusted");

    assert.equal(invoker.cancel(), true);
    assert.equal(invoker.cancel(), true);
    assert.deepEqual(child.kills, ["SIGTERM"]);
    child.process.emit("close", null);
    await pending;
  });

  it("reports no active invocation to cancel when none is running", () => {
    const invoker = createObservableExecuteCliInvoker({
      timeoutMs: 60_000,
      spawnProcess: () => fakeChild().process,
      onProgress: () => {},
    });

    assert.equal(invoker.cancel(), false);
  });

  it("keeps a natural success result deterministic when cancellation loses the race against a confirmed exit", async () => {
    const child = fakeChild();
    const invoker = createObservableExecuteCliInvoker({
      timeoutMs: 60_000,
      spawnProcess: () => child.process,
      onProgress: () => {},
    });
    const pending = invoker.invoke("run", [], "/trusted");

    child.stdout.emit("data", '{"schemaVersion":1}');
    child.process.emit("close", 0);
    assert.deepEqual(await pending, {
      ok: true,
      json: { schemaVersion: 1 },
      exitCode: 0,
    });
    assert.equal(invoker.cancel(), false);
    assert.deepEqual(child.kills, []);
  });

  it("keeps the close guard active through a cancellation until termination is confirmed", async () => {
    const child = fakeChild();
    const invoker = createObservableExecuteCliInvoker({
      timeoutMs: 60_000,
      terminationGraceMs: 5,
      spawnProcess: () => child.process,
      onProgress: () => {},
    });
    const guard = createExecutionWindowCloseGuard();
    const running = guard.run(() => invoker.invoke("run", [], "/trusted"));

    invoker.cancel();
    assert.equal(guard.active, true);
    assert.deepEqual(child.kills, ["SIGTERM"]);
    child.process.emit("close", null);
    assert.deepEqual(await running, {
      ok: false,
      kind: "cancelled",
      raw: "CLI invocation was cancelled.",
    });
    assert.equal(guard.active, false);
  });

  it("marks a cancelled execution session with a single terminal cancelled event, never before confirmation", async () => {
    const child = fakeChild();
    const sessions = createExecutionSessionManager({
      createExecuteHandler(onProgress) {
        const invoker = createObservableExecuteCliInvoker({
          timeoutMs: 60_000,
          terminationGraceMs: 5,
          spawnProcess: () => child.process,
          onProgress,
        });
        return {
          handler: () => invoker.invoke("run", [], "/trusted"),
          cancel: invoker.cancel,
        };
      },
      generateId: () => "session-cancel",
    });

    const started = await sessions.start(request);
    assert.equal(started.ok, true);
    assert.equal(sessions.cancel("session-cancel"), true);
    assert.deepEqual(child.kills, ["SIGTERM"]);
    assert.equal(sessions.get("session-cancel")?.result, null);

    child.process.emit("close", null);
    await sessions.waitForCompletion("session-cancel");
    const completed = sessions.get("session-cancel");
    assert.deepEqual(completed?.result, {
      ok: false,
      kind: "cancelled",
      raw: "CLI invocation was cancelled.",
    });
    assert.deepEqual(
      completed?.events.map((event) => event.type).slice(-1),
      ["cancelled"],
    );
    assert.equal(
      completed?.events.filter((event) => event.type === "cancelled").length,
      1,
    );
  });

  it("fails cleanly, as an explicit no-op, when cancelling with no matching active session", () => {
    const sessions = createExecutionSessionManager({
      createExecuteHandler: () => ({
        handler: async () => ({ ok: true as const, json: {}, exitCode: 0 }),
        cancel: () => false,
      }),
    });

    assert.equal(sessions.cancel("missing-session"), false);
    assert.equal(sessions.cancel(42), false);
  });

  it("does not forward cancellation once the session already reached a terminal result", async () => {
    let cancelCalls = 0;
    const sessions = createExecutionSessionManager({
      createExecuteHandler() {
        return {
          handler: async () => ({ ok: true as const, json: {}, exitCode: 0 }),
          cancel: () => {
            cancelCalls += 1;
            return true;
          },
        };
      },
      generateId: () => "session-done",
    });

    await sessions.start(request);
    await sessions.waitForCompletion("session-done");

    assert.equal(sessions.cancel("session-done"), false);
    assert.equal(cancelCalls, 0);
  });

  it("allows cancellation only while a GUI execution session is truly active", () => {
    assert.equal(canCancelExecution(null), false);
    assert.equal(canCancelExecution({ result: null }), true);
    assert.equal(
      canCancelExecution({ result: { ok: true, json: {}, exitCode: 0 } }),
      false,
    );
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
