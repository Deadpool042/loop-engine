import assert from "node:assert/strict";
import test from "node:test";

import { createOrchestrationServiceLifecycle } from "../../src/service/orchestration-service-lifecycle.js";

test("becomes ready only when persistence and worker are available", () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  assert.equal(lifecycle.snapshot().state, "starting");
  assert.equal(lifecycle.snapshot().ready, false);

  lifecycle.updateDependencies({ persistence: true, worker: false });
  assert.equal(lifecycle.snapshot().state, "starting");

  lifecycle.updateDependencies({ persistence: true, worker: true });
  const snapshot = lifecycle.snapshot();
  assert.equal(snapshot.state, "ready");
  assert.equal(snapshot.healthy, true);
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.acceptingWork, true);
});

test("rejects admission before readiness", () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  assert.deepEqual(lifecycle.admit(), {
    admitted: false,
    reason: "not_ready",
  });
});

test("drain rejects new work and stops after active requests finish", () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  lifecycle.updateDependencies({ persistence: true, worker: true });

  const first = lifecycle.admit();
  const second = lifecycle.admit();
  assert.equal(first.admitted, true);
  assert.equal(second.admitted, true);
  assert.equal(lifecycle.snapshot().activeRequests, 2);

  lifecycle.beginDrain();
  assert.equal(lifecycle.snapshot().state, "draining");
  assert.deepEqual(lifecycle.admit(), {
    admitted: false,
    reason: "draining",
  });

  if (first.admitted) first.release();
  assert.equal(lifecycle.snapshot().state, "draining");
  assert.equal(lifecycle.snapshot().activeRequests, 1);

  if (second.admitted) second.release();
  assert.equal(lifecycle.snapshot().state, "stopped");
  assert.equal(lifecycle.snapshot().activeRequests, 0);
});

test("release is idempotent", () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  lifecycle.updateDependencies({ persistence: true, worker: true });
  const admission = lifecycle.admit();
  assert.equal(admission.admitted, true);
  if (!admission.admitted) return;

  admission.release();
  admission.release();
  assert.equal(lifecycle.snapshot().activeRequests, 0);
});

test("failure is unhealthy and fail-closed", () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  lifecycle.updateDependencies({ persistence: true, worker: true });
  lifecycle.fail("persistence_unavailable");

  const snapshot = lifecycle.snapshot();
  assert.equal(snapshot.state, "failed");
  assert.equal(snapshot.healthy, false);
  assert.equal(snapshot.ready, false);
  assert.equal(snapshot.failureCode, "persistence_unavailable");
  assert.deepEqual(lifecycle.admit(), {
    admitted: false,
    reason: "failed",
  });
});
