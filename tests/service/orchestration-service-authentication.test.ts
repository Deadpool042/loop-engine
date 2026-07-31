import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthenticatedOrchestrationServiceTransport,
  ORCHESTRATION_SERVICE_AUTH_HEADERS,
  signOrchestrationServiceRequest,
  type OrchestrationServiceReplayStore,
  type OrchestrationServiceTransport,
  type OrchestrationServiceTransportRequest,
} from "../../src/service/index.js";

const NOW = 1_800_000_000;
const KEY_ID = "deployment-primary";
const SECRET = "0123456789abcdef0123456789abcdef";

function fixture() {
  let calls = 0;
  const consumed = new Set<string>();
  const inner: OrchestrationServiceTransport = Object.freeze({
    async handle() {
      calls += 1;
      return Object.freeze({
        status: 202,
        headers: Object.freeze({}),
        body: Object.freeze({ accepted: true }),
      });
    },
  });
  const replayStore: OrchestrationServiceReplayStore = Object.freeze({
    async consume(keyId, nonce) {
      const key = `${keyId}:${nonce}`;
      if (consumed.has(key)) return false;
      consumed.add(key);
      return true;
    },
  });
  const transport = createAuthenticatedOrchestrationServiceTransport(inner, {
    keyResolver: Object.freeze({
      async resolve(keyId) {
        return keyId === KEY_ID ? SECRET : null;
      },
    }),
    replayStore,
    nowEpochSeconds: () => NOW,
  });
  return { transport, calls: () => calls };
}

function signedRequest(
  overrides: Partial<OrchestrationServiceTransportRequest> = {},
): OrchestrationServiceTransportRequest {
  const method = overrides.method ?? "POST";
  const path = overrides.path ?? "/v1/executions";
  const body = overrides.body ?? Object.freeze({ project: "alpha", mode: "execute" });
  const nonce = "nonce-001";
  const signature = signOrchestrationServiceRequest({
    keyId: KEY_ID,
    secret: SECRET,
    timestamp: NOW,
    nonce,
    method,
    path,
    body,
  });
  return Object.freeze({
    method,
    path,
    body,
    headers: Object.freeze({
      [ORCHESTRATION_SERVICE_AUTH_HEADERS.keyId]: KEY_ID,
      [ORCHESTRATION_SERVICE_AUTH_HEADERS.timestamp]: String(NOW),
      [ORCHESTRATION_SERVICE_AUTH_HEADERS.nonce]: nonce,
      [ORCHESTRATION_SERVICE_AUTH_HEADERS.signature]: signature,
    }),
    ...overrides,
  });
}

test("allows public probes without authentication", async () => {
  const { transport, calls } = fixture();
  const result = await transport.handle({ method: "GET", path: "/healthz", body: null });
  assert.equal(result.status, 202);
  assert.equal(calls(), 1);
});

test("accepts a valid HMAC request exactly once", async () => {
  const { transport, calls } = fixture();
  const request = signedRequest();
  assert.equal((await transport.handle(request)).status, 202);
  const replay = await transport.handle(request);
  assert.equal(replay.status, 409);
  assert.equal(replay.body.error, "replay_rejected");
  assert.equal(calls(), 1);
});

test("rejects absent, unknown and invalid credentials before inner transport", async () => {
  const { transport, calls } = fixture();
  const absent = await transport.handle({ method: "POST", path: "/v1/executions", body: {} });
  assert.equal(absent.status, 401);
  assert.equal(absent.body.error, "authentication_required");

  const unknown = signedRequest();
  const unknownHeaders = { ...unknown.headers, [ORCHESTRATION_SERVICE_AUTH_HEADERS.keyId]: "unknown" };
  const unknownResult = await transport.handle({ ...unknown, headers: unknownHeaders });
  assert.equal(unknownResult.status, 401);
  assert.equal(unknownResult.body.error, "authentication_failed");

  const invalid = signedRequest();
  const invalidHeaders = { ...invalid.headers, [ORCHESTRATION_SERVICE_AUTH_HEADERS.signature]: "0".repeat(64) };
  const invalidResult = await transport.handle({ ...invalid, headers: invalidHeaders });
  assert.equal(invalidResult.status, 401);
  assert.equal(invalidResult.body.error, "authentication_failed");
  assert.equal(calls(), 0);
});

test("rejects stale and future timestamps", async () => {
  const { transport, calls } = fixture();
  for (const timestamp of [NOW - 301, NOW + 301]) {
    const request = signedRequest();
    const nonce = `nonce-${timestamp}`;
    const signature = signOrchestrationServiceRequest({
      keyId: KEY_ID,
      secret: SECRET,
      timestamp,
      nonce,
      method: request.method,
      path: request.path,
      body: request.body,
    });
    const result = await transport.handle({
      ...request,
      headers: {
        [ORCHESTRATION_SERVICE_AUTH_HEADERS.keyId]: KEY_ID,
        [ORCHESTRATION_SERVICE_AUTH_HEADERS.timestamp]: String(timestamp),
        [ORCHESTRATION_SERVICE_AUTH_HEADERS.nonce]: nonce,
        [ORCHESTRATION_SERVICE_AUTH_HEADERS.signature]: signature,
      },
    });
    assert.equal(result.status, 401);
    assert.equal(result.body.error, "authentication_expired");
  }
  assert.equal(calls(), 0);
});

test("canonical signature is independent from object key insertion order", () => {
  const left = signOrchestrationServiceRequest({
    keyId: KEY_ID,
    secret: SECRET,
    timestamp: NOW,
    nonce: "canonical",
    method: "POST",
    path: "/v1/executions",
    body: { alpha: 1, beta: { one: true, two: false } },
  });
  const right = signOrchestrationServiceRequest({
    keyId: KEY_ID,
    secret: SECRET,
    timestamp: NOW,
    nonce: "canonical",
    method: "POST",
    path: "/v1/executions",
    body: { beta: { two: false, one: true }, alpha: 1 },
  });
  assert.equal(left, right);
});
