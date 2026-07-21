import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createLoopRuntimeEscalationHttpSender,
  type LoopRuntimeEscalationHttpSenderOptions,
} from "../../src/transports/index.js";
import {
  serializeLoopRuntimeEscalationProjection,
  type LoopRuntimeEscalationProjectionSender,
  type LoopRuntimeEscalationPublicProjection,
} from "../../src/core/index.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }

  return Object.freeze(value);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createProjection(): LoopRuntimeEscalationPublicProjection {
  const loopRunResult = deepFreeze({
    schemaVersion: 1,
    runId: "run-fixed",
    project: "fixture-project",
    mode: "execute",
    status: "completed",
    startedAt: "2026-07-21T00:00:00.000Z",
    completedAt: "2026-07-21T00:00:01.000Z",
    candidate: null,
    steps: [],
    validation: null,
    modifiedFiles: [],
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
  }) as unknown as LoopRunResult;

  return deepFreeze({
    schemaVersion: 1,
    loopRunResult,
    runtime: {
      outcome: "executed",
      runtimeStatus: "completed",
      receipt: deepFreeze({
        schemaVersion: 1,
        receiptKind: "redacted",
        details: {
          accepted: true,
        },
      }),
    },
    escalation: {
      outcome: {
        outcome: "succeeded",
        runtimeStatus: "completed",
      },
      failure: {
        kind: null,
        runtimeStatus: "completed",
      },
      decision: {
        action: "none",
        reason: "no_failure",
        failureKind: null,
        runtimeStatus: "completed",
      },
      selectedProfileId: null,
    },
  }) as LoopRuntimeEscalationPublicProjection;
}

function senderOptions(
  overrides: Partial<LoopRuntimeEscalationHttpSenderOptions> = {},
): LoopRuntimeEscalationHttpSenderOptions {
  return {
    url: "https://example.test/runtime-escalation",
    allowedUrls: ["https://example.test/runtime-escalation"],
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-loop-engine": "test",
    },
    timeoutMs: 25,
    maxPayloadBytes: 2_048,
    fetchImpl: async () =>
      ({
        ok: true,
        status: 204,
      }) as Response,
    ...overrides,
  };
}

describe("createLoopRuntimeEscalationHttpSender", () => {
  it("is compatible with the public projection sender contract", async () => {
    const sender: LoopRuntimeEscalationProjectionSender =
      createLoopRuntimeEscalationHttpSender(senderOptions());

    const projection = createProjection();
    await sender.send(serializeLoopRuntimeEscalationProjection(projection));
  });

  it("sends the exact payload once with POST, headers, and redirect error", async () => {
    const calls: Array<{
      input: RequestInfo | URL;
      init?: RequestInit;
    }> = [];
    const options = senderOptions({
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        return {
          ok: true,
          status: 204,
        } as Response;
      },
    });
    const before = {
      url: options.url,
      allowedUrls: [...options.allowedUrls],
      method: options.method,
      headers: options.headers ? { ...options.headers } : undefined,
      timeoutMs: options.timeoutMs,
      maxPayloadBytes: options.maxPayloadBytes,
      fetchImpl: options.fetchImpl,
    };
    const sender = createLoopRuntimeEscalationHttpSender(options);
    const projection = createProjection();
    const payload = serializeLoopRuntimeEscalationProjection(projection);

    await sender.send(payload);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].input, options.url);
    assert.equal(calls[0].init?.method, "POST");
    assert.deepEqual(calls[0].init?.headers, options.headers);
    assert.equal(calls[0].init?.body, payload);
    assert.equal(calls[0].init?.redirect, "error");
    assert.ok(calls[0].init?.signal instanceof AbortSignal);
    assert.equal(options.url, before.url);
    assert.deepEqual(options.allowedUrls, before.allowedUrls);
    assert.equal(options.method, before.method);
    assert.deepEqual(options.headers, before.headers);
    assert.equal(options.timeoutMs, before.timeoutMs);
    assert.equal(options.maxPayloadBytes, before.maxPayloadBytes);
    assert.equal(options.fetchImpl, before.fetchImpl);
    assert.deepEqual(projection, createProjection());
  });

  it("rejects invalid or unauthorized URLs before fetching", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount += 1;
      return { ok: true, status: 204 } as Response;
    };

    const invalidCases: readonly LoopRuntimeEscalationHttpSenderOptions[] = [
      senderOptions({ url: "/relative", fetchImpl }),
      senderOptions({ url: "ftp://example.test/runtime-escalation", fetchImpl }),
      senderOptions({
        allowedUrls: ["https://example.test/other"],
        fetchImpl,
      }),
      senderOptions({
        allowedUrls: ["nota-url"],
        fetchImpl,
      }),
    ];

    for (const options of invalidCases) {
      callCount = 0;
      assert.throws(
        () => createLoopRuntimeEscalationHttpSender(options),
        /HTTP sender configuration rejected/,
      );
      assert.equal(callCount, 0);
    }
  });

  it("rejects oversized payloads before fetching", async () => {
    let callCount = 0;
    const sender = createLoopRuntimeEscalationHttpSender(
      senderOptions({
        maxPayloadBytes: 8,
        fetchImpl: async () => {
          callCount += 1;
          return { ok: true, status: 204 } as Response;
        },
      }),
    );

    await assert.rejects(
      sender.send("payload-too-big"),
      /HTTP sender payload rejected/,
    );
    assert.equal(callCount, 0);
  });

  it("aborts on timeout and clears the timer after settlement", async () => {
    let aborted = false;
    let callCount = 0;
    const sender = createLoopRuntimeEscalationHttpSender(
      senderOptions({
        timeoutMs: 20,
        fetchImpl: async (_input, init) => {
          callCount += 1;
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(new Error("aborted"));
              },
              { once: true },
            );
          });
        },
      }),
    );

    await assert.rejects(
      sender.send("payload"),
      /HTTP sender timed out/,
    );

    await wait(60);
    assert.equal(callCount, 1);
    assert.equal(aborted, true);
  });

  it("rejects non-2xx responses without reading the body", async () => {
    let bodyRead = false;
    let callCount = 0;
    const sender = createLoopRuntimeEscalationHttpSender(
      senderOptions({
        fetchImpl: async () => {
          callCount += 1;
          return {
            ok: false,
            status: 503,
            get body() {
              bodyRead = true;
              return null;
            },
          } as Response;
        },
      }),
    );

    await assert.rejects(
      sender.send("payload"),
      /HTTP sender response rejected/,
    );
    assert.equal(callCount, 1);
    assert.equal(bodyRead, false);
  });

  it("redacts fetch rejections and never retries", async () => {
    let callCount = 0;
    const failure = new Error("socket hang up for https://secret.example");
    const sender = createLoopRuntimeEscalationHttpSender(
      senderOptions({
        fetchImpl: async () => {
          callCount += 1;
          throw failure;
        },
      }),
    );

    await assert.rejects(
      sender.send("payload"),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "HTTP sender request failed");
        assert.doesNotMatch(error.message, /secret|https?:\/\//i);
        assert.equal((error as Error & { cause?: unknown }).cause, failure);
        return true;
      },
    );
    assert.equal(callCount, 1);
  });

  it("leaves inputs unchanged across successful delivery", async () => {
    const options = senderOptions();
    const before = {
      url: options.url,
      allowedUrls: [...options.allowedUrls],
      method: options.method,
      headers: options.headers ? { ...options.headers } : undefined,
      timeoutMs: options.timeoutMs,
      maxPayloadBytes: options.maxPayloadBytes,
      fetchImpl: options.fetchImpl,
    };
    const sender = createLoopRuntimeEscalationHttpSender(options);

    await sender.send(serializeLoopRuntimeEscalationProjection(createProjection()));

    assert.equal(options.url, before.url);
    assert.deepEqual(options.allowedUrls, before.allowedUrls);
    assert.equal(options.method, before.method);
    assert.deepEqual(options.headers, before.headers);
    assert.equal(options.timeoutMs, before.timeoutMs);
    assert.equal(options.maxPayloadBytes, before.maxPayloadBytes);
    assert.equal(options.fetchImpl, before.fetchImpl);
  });
});
