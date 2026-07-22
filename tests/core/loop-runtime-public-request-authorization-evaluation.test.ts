import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  evaluateLoopRuntimePublicRequestAuthorization,
  type LoopRuntimePublicRequestAuthorizationDecision,
  type LoopRuntimePublicRequestAuthorizationRequest,
  type LoopRuntimePublicRequestAuthorizer,
} from "../../src/core/index.js";

function request(
  overrides: Partial<LoopRuntimePublicRequestAuthorizationRequest> = {},
): LoopRuntimePublicRequestAuthorizationRequest {
  return {
    principalId: "principal",
    project: "loop-engine",
    policyRef: "policy.ref",
    profileRef: "profile.ref",
    mode: "execute",
    ...overrides,
  };
}

function syncAuthorizer(
  decision: unknown,
  calls: { count: number } = { count: 0 },
): LoopRuntimePublicRequestAuthorizer {
  return {
    authorize(authorizationRequest) {
      calls.count += 1;
      void authorizationRequest;
      return decision as LoopRuntimePublicRequestAuthorizationDecision;
    },
  };
}

function assertAllowed(
  decision: LoopRuntimePublicRequestAuthorizationDecision,
): void {
  assert.deepEqual(decision, { authorized: true });
  assert.equal(Object.isFrozen(decision), true);
  assert.deepEqual(Reflect.ownKeys(decision), ["authorized"]);
}

function assertDenied(
  decision: LoopRuntimePublicRequestAuthorizationDecision,
): void {
  assert.deepEqual(decision, {
    authorized: false,
    reason: "not_authorized",
  });
  assert.equal(Object.isFrozen(decision), true);
  assert.deepEqual(Reflect.ownKeys(decision), ["authorized", "reason"]);
}

async function evaluate(
  authorizationRequest: unknown,
  authorizer: unknown,
): Promise<LoopRuntimePublicRequestAuthorizationDecision> {
  return evaluateLoopRuntimePublicRequestAuthorization(
    authorizationRequest as LoopRuntimePublicRequestAuthorizationRequest,
    authorizer as LoopRuntimePublicRequestAuthorizer,
  );
}

describe("evaluateLoopRuntimePublicRequestAuthorization", () => {
  it("accepts synchronous allow and deny decisions", async () => {
    assertAllowed(await evaluate(request(), syncAuthorizer({ authorized: true })));
    assertDenied(
      await evaluate(
        request(),
        syncAuthorizer({ authorized: false, reason: "not_authorized" }),
      ),
    );
  });

  it("accepts asynchronous allow and deny decisions", async () => {
    assertAllowed(
      await evaluate(request(), {
        async authorize() {
          return { authorized: true };
        },
      }),
    );
    assertDenied(
      await evaluate(request(), {
        async authorize() {
          return { authorized: false, reason: "not_authorized" };
        },
      }),
    );
  });

  it("evaluates execute and dry-run requests without changing the mode", async () => {
    let seenMode: string | null = null;
    const authorizer: LoopRuntimePublicRequestAuthorizer = {
      authorize(authorizationRequest) {
        seenMode = authorizationRequest.mode;
        return { authorized: true };
      },
    };

    assertAllowed(await evaluate(request(), authorizer));
    assert.equal(seenMode, "execute");
    assertAllowed(await evaluate(request({ mode: "dry-run" }), authorizer));
    assert.equal(seenMode, "dry-run");
  });

  it("rejects invalid request shapes before invoking the authorizer", async () => {
    const calls = { count: 0 };
    const authorizer = syncAuthorizer({ authorized: true }, calls);
    const invalidRequests: readonly unknown[] = [
      null,
      [],
      Object.assign(Object.create({}), request()),
      Object.assign(Object.create(null), request()),
      { ...request(), profileRef: undefined },
      { ...request(), extra: true },
      { ...request(), [Symbol("secret")]: true },
      { ...request(), mode: "publish" },
    ];

    for (const invalidRequest of invalidRequests) {
      assertDenied(await evaluate(invalidRequest, authorizer));
    }

    assert.equal(calls.count, 0);
  });

  it("rejects request getters without invoking them", async () => {
    let getterInvoked = false;
    const authorizationRequest = { ...request() };
    Object.defineProperty(authorizationRequest, "principalId", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("getter must not run");
      },
    });
    const calls = { count: 0 };

    assertDenied(
      await evaluate(
        authorizationRequest,
        syncAuthorizer({ authorized: true }, calls),
      ),
    );
    assert.equal(getterInvoked, false);
    assert.equal(calls.count, 0);
  });

  it("rejects each empty or blank request string before invoking the authorizer", async () => {
    const calls = { count: 0 };
    const authorizer = syncAuthorizer({ authorized: true }, calls);

    for (const field of ["principalId", "project", "policyRef", "profileRef"] as const) {
      assertDenied(await evaluate(request({ [field]: "" }), authorizer));
      assertDenied(await evaluate(request({ [field]: "   " }), authorizer));
    }

    assert.equal(calls.count, 0);
  });

  it("rejects invalid authorizer ports before invocation", async () => {
    assertDenied(await evaluate(request(), null));
    assertDenied(await evaluate(request(), {}));
    assertDenied(await evaluate(request(), { authorize: "nope" }));

    let getterInvoked = false;
    const authorizer = {};
    Object.defineProperty(authorizer, "authorize", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return () => ({ authorized: true });
      },
    });

    assertDenied(await evaluate(request(), authorizer));
    assert.equal(getterInvoked, false);
  });

  it("captures sync exceptions, async rejections, and hostile thenables", async () => {
    assertDenied(
      await evaluate(request(), {
        authorize() {
          throw new Error("secret failure");
        },
      }),
    );
    assertDenied(
      await evaluate(request(), {
        async authorize() {
          throw new Error("secret rejection");
        },
      }),
    );
    assertDenied(
      await evaluate(request(), {
        authorize() {
          return {
            get then() {
              throw new Error("secret thenable");
            },
          } as unknown as LoopRuntimePublicRequestAuthorizationDecision;
        },
      }),
    );
  });

  it("invokes the authorizer exactly once for success and denial", async () => {
    const allowCalls = { count: 0 };
    const denyCalls = { count: 0 };

    assertAllowed(
      await evaluate(request(), syncAuthorizer({ authorized: true }, allowCalls)),
    );
    assertDenied(
      await evaluate(
        request(),
        syncAuthorizer(
          { authorized: false, reason: "not_authorized" },
          denyCalls,
        ),
      ),
    );
    assert.equal(allowCalls.count, 1);
    assert.equal(denyCalls.count, 1);
  });

  it("preserves the authorizer as this", async () => {
    const authorizer = {
      marker: "authorizer-instance",
      authorize(this: { marker: string }) {
        assert.equal(this.marker, "authorizer-instance");
        return { authorized: true };
      },
    };

    assertAllowed(await evaluate(request(), authorizer));
  });

  it("normalizes malformed decisions to the redacted denial", async () => {
    class CustomDecision {
      authorized = true;
    }

    const malformedDecisions: readonly unknown[] = [
      null,
      undefined,
      [],
      new CustomDecision(),
      { authorized: true, permissions: ["read_only"] },
      { authorized: true, reason: "not_authorized" },
      { authorized: false },
      { authorized: false, reason: "missing_permission" },
      { authorized: "true" },
      { authorized: 1 },
      { authorized: true, [Symbol("secret")]: true },
    ];

    for (const malformedDecision of malformedDecisions) {
      assertDenied(await evaluate(request(), syncAuthorizer(malformedDecision)));
    }
  });

  it("rejects hostile decision getters without invoking them", async () => {
    let getterInvoked = false;
    const decision = {};
    Object.defineProperty(decision, "authorized", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("getter must not run");
      },
    });

    assertDenied(await evaluate(request(), syncAuthorizer(decision)));
    assert.equal(getterInvoked, false);
  });

  it("accepts frozen decisions but does not propagate them by identity", async () => {
    const allowed = Object.freeze({ authorized: true });
    const denied = Object.freeze({
      authorized: false,
      reason: "not_authorized" as const,
    });

    const allowedResult = await evaluate(request(), syncAuthorizer(allowed));
    const deniedResult = await evaluate(request(), syncAuthorizer(denied));

    assertAllowed(allowedResult);
    assertDenied(deniedResult);
    assert.notEqual(allowedResult, allowed);
    assert.notEqual(deniedResult, denied);
  });

  it("does not mutate the request or authorizer", async () => {
    const authorizationRequest = Object.freeze(request());
    const authorizer = Object.freeze({
      authorize() {
        return { authorized: true };
      },
    });
    const requestBefore = JSON.stringify(authorizationRequest);
    const authorizerKeysBefore = Reflect.ownKeys(authorizer);

    assertAllowed(await evaluate(authorizationRequest, authorizer));
    assert.equal(JSON.stringify(authorizationRequest), requestBefore);
    assert.deepEqual(Reflect.ownKeys(authorizer), authorizerKeysBefore);
  });

  it("does not contain retry, timeout, cache, fallback, execution, or transport coupling", () => {
    const source = readFileSync(
      "src/core/loop-runtime-public-request-authorization-evaluation.ts",
      "utf8",
    );

    for (const forbidden of [
      "setTimeout",
      "retry",
      "fallback",
      "cache",
      "memo",
      "../runtime/",
      "../agents/",
      "../policy/",
      "../authorization/",
      "../authority/",
      "../transports/",
      "node:child_process",
      "node:fs",
      "process.env",
      "fetch(",
      "http",
      "https",
    ]) {
      assert.equal(source.includes(forbidden), false, `${forbidden} absent`);
    }
  });

  it("exports the evaluation function through Core", () => {
    assert.equal(
      typeof evaluateLoopRuntimePublicRequestAuthorization,
      "function",
    );
  });
});
