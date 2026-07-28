import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateInboundReplayProtection,
  type InboundReplayProtectionInput,
  type InboundReplayProtectionPort,
} from "../../src/inbound-security/index.js";

const INPUT: InboundReplayProtectionInput = Object.freeze({
  requestId: "request-1",
  evidenceId: "evidence-1",
  nonce: "nonce-1",
  evaluatedAt: "2026-07-27T09:00:00.000Z",
});

describe("evaluateInboundReplayProtection", () => {
  it("accepts a valid explicit replay check result", async () => {
    let calls = 0;

    const port: InboundReplayProtectionPort = {
      check(input) {
        calls += 1;
        assert.strictEqual(input, INPUT);
        return {
          accepted: true,
          receivedAt: "2026-07-27T09:00:01.000Z",
        };
      },
    };

    const result = await evaluateInboundReplayProtection(INPUT, port);

    assert.equal(calls, 1);
    assert.deepEqual(result, {
      accepted: true,
      receivedAt: "2026-07-27T09:00:01.000Z",
    });
  });

  it("normalizes replay detection", async () => {
    const port: InboundReplayProtectionPort = {
      check() {
        return {
          accepted: false,
          reason: "replayed",
        };
      },
    };

    assert.deepEqual(await evaluateInboundReplayProtection(INPUT, port), {
      accepted: false,
      reason: "replay_detected",
    });
  });

  it("normalizes unavailable replay protection", async () => {
    const port: InboundReplayProtectionPort = {
      check() {
        return {
          accepted: false,
          reason: "unavailable",
        };
      },
    };

    assert.deepEqual(await evaluateInboundReplayProtection(INPUT, port), {
      accepted: false,
      reason: "replay_unavailable",
    });
  });

  it("fails closed when the port is absent", async () => {
    assert.deepEqual(await evaluateInboundReplayProtection(INPUT, null), {
      accepted: false,
      reason: "replay_unavailable",
    });
  });

  it("fails closed on malformed port output", async () => {
    const port: InboundReplayProtectionPort = {
      check() {
        return { accepted: true } as never;
      },
    };

    assert.deepEqual(await evaluateInboundReplayProtection(INPUT, port), {
      accepted: false,
      reason: "replay_invalid",
    });
  });

  it("fails closed on exceptions without exposing details", async () => {
    const port: InboundReplayProtectionPort = {
      check() {
        throw new Error("backend-secret-detail");
      },
    };

    const result = await evaluateInboundReplayProtection(INPUT, port);

    assert.deepEqual(result, {
      accepted: false,
      reason: "replay_invalid",
    });
    assert.equal(JSON.stringify(result).includes("backend-secret-detail"), false);
  });

  it("rejects a blank nonce before calling the port", async () => {
    let calls = 0;

    const port: InboundReplayProtectionPort = {
      check() {
        calls += 1;
        return {
          accepted: true,
          receivedAt: "2026-07-27T09:00:01.000Z",
        };
      },
    };

    const result = await evaluateInboundReplayProtection(
      {
        ...INPUT,
        nonce: "   ",
      },
      port,
    );

    assert.equal(calls, 0);
    assert.deepEqual(result, {
      accepted: false,
      reason: "replay_invalid",
    });
  });

  it("rejects malformed input before calling the port", async () => {
    let calls = 0;

    const port: InboundReplayProtectionPort = {
      check() {
        calls += 1;
        return {
          accepted: true,
          receivedAt: "2026-07-27T09:00:01.000Z",
        };
      },
    };

    const result = await evaluateInboundReplayProtection(
      {
        ...INPUT,
        requestId: "",
      },
      port,
    );

    assert.equal(calls, 0);
    assert.deepEqual(result, {
      accepted: false,
      reason: "replay_invalid",
    });
  });
});
