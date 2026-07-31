import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";

import {
  createNodeHttpServiceAdapter,
  createOrchestrationServiceLifecycle,
  createOrchestrationServiceTransport,
} from "../../src/service/index.js";

type HttpResult = Readonly<{ status: number; body: Record<string, unknown> }>;

function call(
  host: string,
  port: number,
  method: string,
  path: string,
  body?: string,
): Promise<HttpResult> {
  return new Promise<HttpResult>((resolve, reject) => {
    const outgoing = request(
      { host, port, method, path, headers: body === undefined ? {} : { "content-type": "application/json" } },
      (incoming) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => {
          const serialized = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: incoming.statusCode ?? 0,
            body: JSON.parse(serialized) as Record<string, unknown>,
          });
        });
      },
    );
    outgoing.on("error", reject);
    if (body !== undefined) outgoing.write(body);
    outgoing.end();
  });
}

function fixture() {
  const lifecycle = createOrchestrationServiceLifecycle();
  lifecycle.updateDependencies({ persistence: true, worker: true });
  const transport = createOrchestrationServiceTransport(lifecycle, {
    async execute(payload) {
      return Object.freeze({ payload });
    },
  });
  const adapter = createNodeHttpServiceAdapter(lifecycle, transport);
  return { lifecycle, adapter };
}

test("serves health, readiness and versioned execution over real HTTP", async () => {
  const { adapter } = fixture();
  const address = await adapter.start();

  try {
    const health = await call(address.host, address.port, "GET", "/healthz");
    assert.equal(health.status, 200);
    assert.equal(health.body.kind, "health");

    const readiness = await call(address.host, address.port, "GET", "/readyz");
    assert.equal(readiness.status, 200);
    assert.equal(readiness.body.ready, true);

    const execution = await call(
      address.host,
      address.port,
      "POST",
      "/v1/executions",
      JSON.stringify({ project: "alpha" }),
    );
    assert.equal(execution.status, 202);
    assert.equal(execution.body.accepted, true);
  } finally {
    await adapter.stop();
  }
});

test("rejects malformed and oversized request bodies before transport", async () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  lifecycle.updateDependencies({ persistence: true, worker: true });
  let calls = 0;
  const transport = createOrchestrationServiceTransport(lifecycle, {
    async execute() {
      calls += 1;
      return Object.freeze({});
    },
  });
  const adapter = createNodeHttpServiceAdapter(lifecycle, transport, { maxBodyBytes: 8 });
  const address = await adapter.start();

  try {
    const malformed = await call(address.host, address.port, "POST", "/v1/executions", "{");
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error, "invalid_json");

    const oversized = await call(address.host, address.port, "POST", "/v1/executions", "123456789");
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.error, "payload_too_large");
    assert.equal(calls, 0);
  } finally {
    await adapter.stop();
  }
});

test("returns method_not_allowed for unsupported methods", async () => {
  const { adapter } = fixture();
  const address = await adapter.start();
  try {
    const result = await call(address.host, address.port, "DELETE", "/healthz");
    assert.equal(result.status, 405);
    assert.equal(result.body.error, "method_not_allowed");
  } finally {
    await adapter.stop();
  }
});

test("stop is idempotent and transitions lifecycle to stopped", async () => {
  const { lifecycle, adapter } = fixture();
  await adapter.start();
  await Promise.all([adapter.stop(), adapter.stop()]);
  assert.equal(adapter.address(), null);
  assert.equal(lifecycle.snapshot().state, "stopped");
  await adapter.stop();
});

test("validates binding and body-limit options", () => {
  const lifecycle = createOrchestrationServiceLifecycle();
  const transport = createOrchestrationServiceTransport(lifecycle, {
    async execute() { return Object.freeze({}); },
  });

  assert.throws(() => createNodeHttpServiceAdapter(lifecycle, transport, { host: " " }), /host/);
  assert.throws(() => createNodeHttpServiceAdapter(lifecycle, transport, { port: 70_000 }), /port/);
  assert.throws(() => createNodeHttpServiceAdapter(lifecycle, transport, { maxBodyBytes: 0 }), /body limit/);
});
