import assert from "node:assert/strict";
import test from "node:test";

import { createOrchestrationServiceLifecycle } from "../../src/service/orchestration-service-lifecycle.js";
import { createOrchestrationServiceTransport } from "../../src/service/orchestration-service-transport.js";

test("exposes distinct health and readiness probes", async () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  const transport = createOrchestrationServiceTransport(lifecycle, {
    async execute() {
      return Object.freeze({ executionId: "unused" });
    },
  });

  const health = await transport.handle({ method: "GET", path: "/healthz", body: null });
  const readiness = await transport.handle({ method: "GET", path: "/readyz", body: null });

  assert.equal(health.status, 200);
  assert.equal(health.body.healthy, true);
  assert.equal(readiness.status, 503);
  assert.equal(readiness.body.ready, false);

  lifecycle.updateDependencies({ persistence: true, worker: true });
  const ready = await transport.handle({ method: "GET", path: "/readyz", body: null });
  assert.equal(ready.status, 200);
  assert.equal(ready.body.ready, true);
});

test("admits versioned execution and releases lifecycle capacity", async () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  lifecycle.updateDependencies({ persistence: true, worker: true });
  const seen: unknown[] = [];
  const transport = createOrchestrationServiceTransport(lifecycle, {
    async execute(payload) {
      seen.push(payload);
      assert.equal(lifecycle.snapshot().activeRequests, 1);
      return Object.freeze({ executionId: "exec-1", status: "accepted" });
    },
  });

  const payload = Object.freeze({ project: "alpha" });
  const result = await transport.handle({
    method: "POST",
    path: "/v1/executions",
    body: payload,
  });

  assert.equal(result.status, 202);
  assert.equal(result.body.apiVersion, "v1");
  assert.equal(result.body.accepted, true);
  assert.deepEqual(seen, [payload]);
  assert.equal(lifecycle.snapshot().activeRequests, 0);
});

test("rejects new work while service is not ready or draining", async () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  let calls = 0;
  const transport = createOrchestrationServiceTransport(lifecycle, {
    async execute() {
      calls += 1;
      return Object.freeze({});
    },
  });

  const unavailable = await transport.handle({
    method: "POST",
    path: "/v1/executions",
    body: {},
  });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.error, "not_ready");

  lifecycle.updateDependencies({ persistence: true, worker: true });
  const active = lifecycle.admit();
  assert.equal(active.admitted, true);
  lifecycle.beginDrain();

  const draining = await transport.handle({
    method: "POST",
    path: "/v1/executions",
    body: {},
  });
  assert.equal(draining.status, 503);
  assert.equal(draining.body.error, "draining");
  assert.equal(calls, 0);
  if (active.admitted) active.release();
});

test("redacts execution failures and releases admission", async () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  lifecycle.updateDependencies({ persistence: true, worker: true });
  const transport = createOrchestrationServiceTransport(lifecycle, {
    async execute() {
      throw new Error("secret provider diagnostic");
    },
  });

  const result = await transport.handle({
    method: "POST",
    path: "/v1/executions",
    body: {},
  });

  assert.equal(result.status, 500);
  assert.equal(result.body.error, "execution_failed");
  assert.equal(JSON.stringify(result.body).includes("secret"), false);
  assert.equal(lifecycle.snapshot().activeRequests, 0);
});

test("returns a stable versioned response for unknown routes", async () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  const transport = createOrchestrationServiceTransport(lifecycle, {
    async execute() {
      return Object.freeze({});
    },
  });

  const result = await transport.handle({ method: "GET", path: "/unknown", body: null });
  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { apiVersion: "v1", error: "route_not_found" });
  assert.equal(result.headers["cache-control"], "no-store");
});
