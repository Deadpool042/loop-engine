import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  authorizeLoopRuntimePublicRequest,
  createLoopRuntimePublicRequestAuthorizationRequest,
  evaluateLoopRuntimePublicRequestAuthorization,
  type LoopRuntimeAuthenticatedPrincipal,
  type LoopRuntimePublicRequest,
  type LoopRuntimePublicRequestAuthorizationDecision,
  type LoopRuntimePublicRequestAuthorizationRequest,
  type LoopRuntimePublicRequestAuthorizer,
} from "../../src/core/index.js";

function principal(
  principalId = "principal.raw ",
): LoopRuntimeAuthenticatedPrincipal {
  return {
    principalId,
  };
}

function request(
  overrides: Partial<LoopRuntimePublicRequest> = {},
): LoopRuntimePublicRequest {
  return {
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: " loop-engine ",
    cycleId: " cycle-1 ",
    mode: "execute",
    policyRef: " policy.ref ",
    profileRef: " profile.ref ",
    requestedMaxEffort: "medium",
    budget: {
      maxTokens: 10,
      maxCostUsd: 1,
      maxDurationMs: 1_000,
      maxCalls: 1,
      maxRepairs: 0,
    },
    ...overrides,
  };
}

function syncAuthorizer(
  decision: unknown,
  calls: { count: number } = { count: 0 },
  seen: { request: LoopRuntimePublicRequestAuthorizationRequest | null } = {
    request: null,
  },
): LoopRuntimePublicRequestAuthorizer {
  return {
    authorize(authorizationRequest) {
      calls.count += 1;
      seen.request = authorizationRequest;
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

async function authorize(
  authenticatedPrincipal: unknown,
  publicRequest: unknown,
  authorizer: unknown,
): Promise<LoopRuntimePublicRequestAuthorizationDecision> {
  return authorizeLoopRuntimePublicRequest(
    authenticatedPrincipal as LoopRuntimeAuthenticatedPrincipal,
    publicRequest as LoopRuntimePublicRequest,
    authorizer as LoopRuntimePublicRequestAuthorizer,
  );
}

describe("authorizeLoopRuntimePublicRequest", () => {
  it("authorizes valid principal and request with a synchronous authorizer", async () => {
    assertAllowed(
      await authorize(
        principal(),
        request(),
        syncAuthorizer({ authorized: true }),
      ),
    );
  });

  it("propagates a synchronous denial", async () => {
    assertDenied(
      await authorize(
        principal(),
        request(),
        syncAuthorizer({ authorized: false, reason: "not_authorized" }),
      ),
    );
  });

  it("authorizes valid principal and request with an asynchronous authorizer", async () => {
    assertAllowed(
      await authorize(principal(), request(), {
        async authorize() {
          return { authorized: true };
        },
      }),
    );
  });

  it("propagates an asynchronous denial", async () => {
    assertDenied(
      await authorize(principal(), request(), {
        async authorize() {
          return { authorized: false, reason: "not_authorized" };
        },
      }),
    );
  });

  it("passes execute and dry-run modes through authorization", async () => {
    const seenModes: string[] = [];
    const authorizer: LoopRuntimePublicRequestAuthorizer = {
      authorize(authorizationRequest) {
        seenModes.push(authorizationRequest.mode);
        return { authorized: true };
      },
    };

    assertAllowed(await authorize(principal(), request(), authorizer));
    assertAllowed(
      await authorize(principal(), request({ mode: "dry-run" }), authorizer),
    );
    assert.deepEqual(seenModes, ["execute", "dry-run"]);
  });

  it("redacts invalid principal and invalid request creation failures", async () => {
    const calls = { count: 0 };
    const authorizer = syncAuthorizer({ authorized: true }, calls);

    assertDenied(await authorize({ principalId: "" }, request(), authorizer));
    assertDenied(await authorize(principal(), request({ project: "" }), authorizer));
    assert.equal(calls.count, 0);
  });

  it("rejects hostile principal getters without invoking the authorizer", async () => {
    let getterInvoked = false;
    const hostilePrincipal = {};
    Object.defineProperty(hostilePrincipal, "principalId", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("getter must not run");
      },
    });
    const calls = { count: 0 };

    assertDenied(
      await authorize(
        hostilePrincipal,
        request(),
        syncAuthorizer({ authorized: true }, calls),
      ),
    );
    assert.equal(getterInvoked, false);
    assert.equal(calls.count, 0);
  });

  it("maps invalid authorizers, exceptions, rejections, and malformed decisions to denial", async () => {
    assertDenied(await authorize(principal(), request(), null));
    assertDenied(
      await authorize(principal(), request(), {
        authorize() {
          throw new Error("secret sync failure");
        },
      }),
    );
    assertDenied(
      await authorize(principal(), request(), {
        async authorize() {
          throw new Error("secret async failure");
        },
      }),
    );
    assertDenied(
      await authorize(
        principal(),
        request(),
        syncAuthorizer({ authorized: false, reason: "missing_permission" }),
      ),
    );
  });

  it("invokes the authorizer exactly once for allowed and denied decisions", async () => {
    const allowCalls = { count: 0 };
    const denyCalls = { count: 0 };

    assertAllowed(
      await authorize(
        principal(),
        request(),
        syncAuthorizer({ authorized: true }, allowCalls),
      ),
    );
    assertDenied(
      await authorize(
        principal(),
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

  it("preserves this through the V13.62 evaluator", async () => {
    const authorizer = {
      marker: "authorizer-instance",
      authorize(this: { marker: string }) {
        assert.equal(this.marker, "authorizer-instance");
        return { authorized: true };
      },
    };

    assertAllowed(await authorize(principal(), request(), authorizer));
  });

  it("passes the exact V13.61 authorization request surface to the authorizer", async () => {
    const seen = {
      request: null as LoopRuntimePublicRequestAuthorizationRequest | null,
    };
    const publicRequest = request();

    assertAllowed(
      await authorize(
        principal(),
        publicRequest,
        syncAuthorizer({ authorized: true }, { count: 0 }, seen),
      ),
    );

    assert.deepEqual(seen.request, {
      principalId: "principal.raw ",
      project: " loop-engine ",
      policyRef: " policy.ref ",
      profileRef: " profile.ref ",
      mode: "execute",
    });
    assert.deepEqual(Reflect.ownKeys(seen.request ?? {}), [
      "principalId",
      "project",
      "policyRef",
      "profileRef",
      "mode",
    ]);

    const serialized = JSON.stringify(seen.request);
    for (const forbidden of [
      "cycleId",
      "budget",
      "requestedMaxEffort",
      "effort",
      "policyId",
      "profileId",
    ]) {
      assert.equal(serialized.includes(forbidden), false, `${forbidden} absent`);
    }
  });

  it("redacts creation failure reasons from the result", async () => {
    const result = await authorize(principal(), request({ policyRef: "" }), {
      authorize() {
        throw new Error("must not be called");
      },
    });

    assertDenied(result);
    assert.equal(JSON.stringify(result).includes("invalid_authorization_context"), false);
  });

  it("propagates the V13.62 decision by identity after successful creation", async () => {
    const publicRequest = request();
    const authenticatedPrincipal = principal();
    const authorizer = syncAuthorizer({ authorized: true });
    const creation = createLoopRuntimePublicRequestAuthorizationRequest(
      authenticatedPrincipal,
      publicRequest,
    );

    assert.equal(creation.created, true);
    if (!creation.created) {
      return;
    }

    const directDecision = await evaluateLoopRuntimePublicRequestAuthorization(
      creation.authorizationRequest,
      authorizer,
    );
    const facadeDecision = await authorizeLoopRuntimePublicRequest(
      authenticatedPrincipal,
      publicRequest,
      authorizer,
    );

    assert.equal(facadeDecision, directDecision);
    assertAllowed(facadeDecision);
  });

  it("returns frozen exact decision surfaces", async () => {
    const allowed = await authorize(
      principal(),
      request(),
      syncAuthorizer({ authorized: true }),
    );
    const denied = await authorize(
      principal(),
      request(),
      syncAuthorizer({ authorized: false, reason: "not_authorized" }),
    );

    assertAllowed(allowed);
    assertDenied(denied);
    for (const decision of [allowed, denied]) {
      const serialized = JSON.stringify(decision);
      for (const forbidden of [
        "principalId",
        "project",
        "policyRef",
        "profileRef",
        "mode",
        "authorizationRequest",
        "invalid_authorization_context",
        "error",
        "stage",
        "catalog",
        "limits",
        "binding",
        "policyId",
        "profileId",
      ]) {
        assert.equal(serialized.includes(forbidden), false, `${forbidden} absent`);
      }
    }
  });

  it("accepts frozen inputs without mutation and remains deterministic", async () => {
    const authenticatedPrincipal = Object.freeze(principal());
    const publicRequest = Object.freeze({
      ...request({ cycleId: undefined }),
      budget: Object.freeze(request().budget),
    });
    const authorizer = Object.freeze(syncAuthorizer({ authorized: true }));
    const principalBefore = JSON.stringify(authenticatedPrincipal);
    const requestBefore = JSON.stringify(publicRequest);
    const authorizerKeysBefore = Reflect.ownKeys(authorizer);

    const first = await authorize(
      authenticatedPrincipal,
      publicRequest,
      authorizer,
    );
    const second = await authorize(
      authenticatedPrincipal,
      publicRequest,
      authorizer,
    );

    assertAllowed(first);
    assertAllowed(second);
    assert.deepEqual(first, second);
    assert.equal(JSON.stringify(authenticatedPrincipal), principalBefore);
    assert.equal(JSON.stringify(publicRequest), requestBefore);
    assert.deepEqual(Reflect.ownKeys(authorizer), authorizerKeysBefore);
  });

  it("contains only facade composition and no direct invocation or downstream coupling", () => {
    const source = readFileSync(
      "src/core/loop-runtime-public-request-authorization-facade.ts",
      "utf8",
    );

    assert.equal(source.includes(".authorize("), false);
    for (const forbidden of [
      "decodeLoopRuntimePublicRequest",
      "prepareLoopRuntimePublicRequest",
      "decodeAndPrepareLoopRuntimePublicRequest",
      "resolveLoopRuntimePublicRequestReferences",
      "catalog",
      "limits",
      "binding",
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
      "setTimeout",
      "retry",
      "fallback",
      "cache",
    ]) {
      assert.equal(source.includes(forbidden), false, `${forbidden} absent`);
    }
  });

  it("exports the facade through Core", () => {
    assert.equal(typeof authorizeLoopRuntimePublicRequest, "function");
  });
});
