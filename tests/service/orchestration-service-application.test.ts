import assert from "node:assert/strict";
import test from "node:test";

import {
  createOrchestrationServiceApplication,
  installOrchestrationServiceSignalHandlers,
  loadOrchestrationServiceConfiguration,
} from "../../src/service/index.js";

test("loads deterministic defaults and validated overrides", () => {
  assert.deepEqual(loadOrchestrationServiceConfiguration({}), {
    host: "127.0.0.1",
    port: 8080,
    maxBodyBytes: 1_048_576,
  });
  assert.deepEqual(
    loadOrchestrationServiceConfiguration({
      LOOP_SERVICE_HOST: "0.0.0.0",
      LOOP_SERVICE_PORT: "0",
      LOOP_SERVICE_MAX_BODY_BYTES: "4096",
    }),
    { host: "0.0.0.0", port: 0, maxBodyBytes: 4096 },
  );
  assert.throws(
    () => loadOrchestrationServiceConfiguration({ LOOP_SERVICE_PORT: "abc" }),
    /integer/,
  );
  assert.throws(
    () => loadOrchestrationServiceConfiguration({ LOOP_SERVICE_HOST: " " }),
    /non-empty/,
  );
});

test("starts only after persistence and worker readiness", async () => {
  const application = createOrchestrationServiceApplication(
    { host: "127.0.0.1", port: 0, maxBodyBytes: 1024 },
    {
      async persistenceReady() { return true; },
      async workerReady() { return true; },
      execution: { async execute() { return Object.freeze({ accepted: true }); } },
    },
  );

  const address = await application.start();
  assert.equal(address.host, "127.0.0.1");
  assert.ok(address.port > 0);
  assert.equal(application.lifecycle.snapshot().state, "ready");
  await application.stop();
  assert.equal(application.lifecycle.snapshot().state, "stopped");
});

test("fails closed when a startup dependency is unavailable", async () => {
  const application = createOrchestrationServiceApplication(
    { host: "127.0.0.1", port: 0, maxBodyBytes: 1024 },
    {
      async persistenceReady() { return false; },
      async workerReady() { return true; },
      execution: { async execute() { return Object.freeze({}); } },
    },
  );

  await assert.rejects(application.start(), /not ready/);
  assert.equal(application.lifecycle.snapshot().state, "failed");
  assert.equal(
    application.lifecycle.snapshot().failureCode,
    "persistence_unavailable",
  );
});

test("installs idempotent SIGINT and SIGTERM shutdown handlers", async () => {
  const listeners = new Map<string, () => void>();
  let stops = 0;
  const cleanup = installOrchestrationServiceSignalHandlers(
    { async stop() { stops += 1; } },
    {
      once(signal, listener) { listeners.set(signal, listener); },
      off(signal) { listeners.delete(signal); },
    },
  );

  listeners.get("SIGTERM")?.();
  listeners.get("SIGINT")?.();
  await Promise.resolve();
  assert.equal(stops, 1);
  cleanup();
  assert.equal(listeners.size, 0);
});
