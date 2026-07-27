import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  handleInboundTransportRequest,
  type InboundLoopRuntimeRequestEnvelope,
  type InboundTransportAdapter,
} from "../../src/core/index.js";
import type { InboundAuthenticationVerifier } from "../../src/inbound-security/index.js";

const EVALUATED_AT = "2026-07-27T08:00:00.000Z";

function envelope(): InboundLoopRuntimeRequestEnvelope {
  return Object.freeze({
    requestId: "request-1",
    authenticationInput: Object.freeze({
      method: "opaque",
      credential: "raw-secret-never-forward",
      issuerHint: "issuer-1",
      subjectHint: "principal-1",
    }),
    verificationContext: Object.freeze({
      requestId: "request-1",
      evaluatedAt: EVALUATED_AT,
    }),
    principal: Object.freeze({
      principalId: "principal-1",
      principalType: "user",
      tenantId: "tenant-1",
      roles: Object.freeze(["operator"]),
    }),
    accessRequest: Object.freeze({
      requestId: "request-1",
      principalId: "principal-1",
      tenantId: "tenant-1",
      project: "loop-engine",
      operation: "execute",
    }),
    replayEvidence: null,
    policy: Object.freeze({
      allowedOperations: Object.freeze(["execute"]),
      replayCheckRequired: false,
    }),
    evaluatedAt: EVALUATED_AT,
    payload: Object.freeze({}),
  });
}

function dependencies(calls: { verifier: number }) {
  const verifier: InboundAuthenticationVerifier = {
    verify() {
      calls.verifier += 1;
      return { verified: false as const, reason: "rejected" as const };
    },
  };

  return {
    verifier,
    authorizer: {
      authorize() {
        return { authorized: false as const, reason: "not_authorized" as const };
      },
    },
    assembler: {
      assemble() {
        return { assembled: false as const, reason: "assembly_unavailable" as const };
      },
    },
  };
}

describe("handleInboundTransportRequest", () => {
  it("decodes once, routes through V14.0c, then maps only the closed handler result", async () => {
    const calls = { decode: 0, mapResponse: 0, verifier: 0 };
    let mappedInput: unknown;
    const adapter: InboundTransportAdapter = {
      decode(input) {
        calls.decode += 1;
        assert.deepEqual(input, { transport: "opaque" });
        return envelope();
      },
      mapResponse(result) {
        calls.mapResponse += 1;
        mappedInput = result;
        return Object.freeze({ outcome: result.outcome, payload: result });
      },
    };

    const result = await handleInboundTransportRequest(
      { transport: "opaque" },
      adapter,
      dependencies(calls),
    );

    assert.equal(result.handled, true);
    assert.deepEqual(calls, { decode: 1, mapResponse: 1, verifier: 1 });
    assert.deepEqual(mappedInput, {
      outcome: "rejected",
      stage: "authentication",
      reason: "verification_rejected",
    });
    assert.equal(JSON.stringify(mappedInput).includes("raw-secret-never-forward"), false);
  });

  it("normalizes a decoder exception into an invalid handler outcome", async () => {
    const calls = { decode: 0, mapResponse: 0, verifier: 0 };
    const adapter: InboundTransportAdapter = {
      decode() {
        calls.decode += 1;
        throw new Error("transport decoder detail must not escape");
      },
      mapResponse(result) {
        calls.mapResponse += 1;
        return Object.freeze({ outcome: result.outcome, payload: result });
      },
    };

    const result = await handleInboundTransportRequest(
      { raw: true },
      adapter,
      dependencies(calls),
    );

    assert.equal(result.handled, true);
    if (result.handled) {
      assert.deepEqual(result.response.payload, {
        outcome: "invalid",
        reason: "malformed_envelope",
      });
    }
    assert.deepEqual(calls, { decode: 1, mapResponse: 1, verifier: 0 });
    assert.equal(JSON.stringify(result).includes("transport decoder detail"), false);
  });

  it("fails closed when the adapter is unavailable without touching the handler", async () => {
    const calls = { verifier: 0 };
    const result = await handleInboundTransportRequest(
      { raw: true },
      null,
      dependencies(calls),
    );

    assert.deepEqual(result, {
      handled: false,
      reason: "adapter_unavailable",
    });
    assert.equal(calls.verifier, 0);
  });

  it("rejects response mapping whose outcome disagrees with the handler", async () => {
    const calls = { verifier: 0 };
    const adapter: InboundTransportAdapter = {
      decode() {
        return envelope();
      },
      mapResponse() {
        return Object.freeze({ outcome: "accepted", payload: null });
      },
    };

    const result = await handleInboundTransportRequest(
      { raw: true },
      adapter,
      dependencies(calls),
    );

    assert.deepEqual(result, {
      handled: false,
      reason: "response_mapping_invalid",
    });
    assert.equal(calls.verifier, 1);
  });

  it("normalizes response mapping exceptions without exposing exception details", async () => {
    const calls = { verifier: 0 };
    const adapter: InboundTransportAdapter = {
      decode() {
        return envelope();
      },
      mapResponse() {
        throw new Error("mapper-secret-detail");
      },
    };

    const result = await handleInboundTransportRequest(
      { raw: true },
      adapter,
      dependencies(calls),
    );

    assert.deepEqual(result, {
      handled: false,
      reason: "response_mapping_failed",
    });
    assert.equal(JSON.stringify(result).includes("mapper-secret-detail"), false);
  });
});
