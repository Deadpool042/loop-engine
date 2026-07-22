import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  decodeAndAuthorizeLoopRuntimePublicRequest,
  type LoopRuntimeAuthenticatedPrincipal,
  type LoopRuntimePublicRequest,
  type LoopRuntimePublicRequestAuthorizedEntryInput,
  type LoopRuntimePublicRequestAuthorizedEntryResult,
  type LoopRuntimePublicRequestAuthorizer,
} from "../../src/core/index.js";

function principal(
  principalId = "principal.raw ",
): LoopRuntimeAuthenticatedPrincipal {
  return {
    principalId,
  };
}

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

function budget(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    maxTokens: 10,
    maxCostUsd: 1,
    maxDurationMs: 1_000,
    maxCalls: 1,
    maxRepairs: 0,
    ...overrides,
  };
}

function authorizer(
  decision: unknown,
  calls: { count: number } = { count: 0 },
  seen: { request: unknown } = { request: null },
): LoopRuntimePublicRequestAuthorizer {
  return {
    authorize(authorizationRequest) {
      calls.count += 1;
      seen.request = authorizationRequest;
      return decision as never;
    },
  };
}

async function decodeAndAuthorize(
  input: Partial<LoopRuntimePublicRequestAuthorizedEntryInput> = {},
): Promise<LoopRuntimePublicRequestAuthorizedEntryResult> {
  return decodeAndAuthorizeLoopRuntimePublicRequest({
    principal: principal(),
    payload: payload(),
    authorizer: authorizer({ authorized: true }),
    ...input,
  });
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertSuccess(
  result: LoopRuntimePublicRequestAuthorizedEntryResult,
): asserts result is Extract<
  LoopRuntimePublicRequestAuthorizedEntryResult,
  { authorized: true }
> {
  assert.equal(result.authorized, true);
  assert.deepEqual(Object.keys(result), ["authorized", "request"]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.request), true);
  assert.equal(Object.isFrozen(result.request.budget), true);
}

function assertDecodingFailure(
  result: LoopRuntimePublicRequestAuthorizedEntryResult,
  reason: string,
): void {
  assert.deepEqual(result, {
    authorized: false,
    stage: "decoding",
    reason,
  });
  assert.deepEqual(Object.keys(result), ["authorized", "stage", "reason"]);
  assert.equal(Object.isFrozen(result), true);
}

function assertAuthorizationFailure(
  result: LoopRuntimePublicRequestAuthorizedEntryResult,
): void {
  assert.deepEqual(result, {
    authorized: false,
    stage: "authorization",
    reason: "not_authorized",
  });
  assert.deepEqual(Object.keys(result), ["authorized", "stage", "reason"]);
  assert.equal(Object.isFrozen(result), true);
}

function assertNoForbiddenFields(value: unknown): void {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    "principal",
    "principalId",
    "authorizer",
    "authorizationRequest",
    "authorizationDecision",
    "payload",
    "catalog",
    "limits",
    "binding",
    "runtimeId",
    "policyId",
    "profileId",
    "executable",
    "arguments",
    "cwd",
    "resolution",
    "preparation",
    "invalid_authorization_context",
    "permission",
    "role",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} absent`);
  }
}

describe("decodeAndAuthorizeLoopRuntimePublicRequest", () => {
  it("decodes and authorizes execute payloads with sync and async authorizers", async () => {
    const syncResult = await decodeAndAuthorize({
      authorizer: authorizer({ authorized: true }),
    });
    const asyncResult = await decodeAndAuthorize({
      authorizer: {
        async authorize() {
          return { authorized: true };
        },
      },
    });

    assertSuccess(syncResult);
    assertSuccess(asyncResult);
    assert.equal(syncResult.request.mode, "execute");
    assert.equal(asyncResult.request.mode, "execute");
  });

  it("maps sync and async authorization denial to the redacted authorization stage", async () => {
    assertAuthorizationFailure(
      await decodeAndAuthorize({
        authorizer: authorizer({ authorized: false, reason: "not_authorized" }),
      }),
    );
    assertAuthorizationFailure(
      await decodeAndAuthorize({
        authorizer: {
          async authorize() {
            return { authorized: false, reason: "not_authorized" };
          },
        },
      }),
    );
  });

  it("authorizes dry-run without transformation or runtime preparation", async () => {
    const result = await decodeAndAuthorize({
      payload: payload({ mode: "dry-run" }),
    });

    assertSuccess(result);
    assert.equal(result.request.mode, "dry-run");
    assert.equal(JSON.stringify(result).includes("unsupported_dry_run"), false);
  });

  it("stops at decoding for invalid payload shapes and unexpected fields", async () => {
    assertDecodingFailure(
      await decodeAndAuthorize({ payload: null }),
      "invalid_request_object",
    );
    assertDecodingFailure(
      await decodeAndAuthorize({ payload: [] }),
      "invalid_request_object",
    );
    assertDecodingFailure(
      await decodeAndAuthorize({ payload: payload({ executable: "node" }) }),
      "unexpected_request_field",
    );
    assertDecodingFailure(
      await decodeAndAuthorize({
        payload: payload({ budget: budget({ unexpected: true }) }),
      }),
      "unexpected_budget_field",
    );
  });

  it("does not invoke hostile payload getters and handles hostile proxies", async () => {
    let getterInvoked = false;
    const withGetter = payload();
    Object.defineProperty(withGetter, "project", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("getter must not run");
      },
    });

    assertDecodingFailure(
      await decodeAndAuthorize({ payload: withGetter }),
      "invalid_request_property",
    );
    assert.equal(getterInvoked, false);

    const proxy = new Proxy(payload(), {
      ownKeys() {
        throw new Error("hostile proxy");
      },
    });

    assertDecodingFailure(
      await decodeAndAuthorize({ payload: proxy }),
      "invalid_input",
    );
  });

  it("propagates every decoding reason exactly", async () => {
    const cases: readonly [unknown, string][] = [
      [new Proxy(payload(), { ownKeys() { throw new Error("proxy"); } }), "invalid_input"],
      [null, "invalid_request_object"],
      [(() => {
        const value = payload();
        Object.defineProperty(value, "project", {
          enumerable: true,
          get() {
            throw new Error("getter must not run");
          },
        });
        return value;
      })(), "invalid_request_property"],
      [(() => {
        const value = payload();
        delete value.project;
        return value;
      })(), "missing_request_field"],
      [payload({ extra: true }), "unexpected_request_field"],
      [payload({ budget: null }), "invalid_budget_object"],
      [(() => {
        const badBudget = budget();
        Object.defineProperty(badBudget, "maxTokens", {
          enumerable: true,
          get() {
            throw new Error("budget getter must not run");
          },
        });
        return payload({ budget: badBudget });
      })(), "invalid_budget_property"],
      [(() => {
        const value = budget();
        delete value.maxTokens;
        return payload({ budget: value });
      })(), "missing_budget_field"],
      [payload({ budget: budget({ extra: true }) }), "unexpected_budget_field"],
      [payload({ schemaVersion: 2 }), "unsupported_schema"],
      [payload({ project: "" }), "invalid_project"],
      [payload({ cycleId: "" }), "invalid_cycle_id"],
      [payload({ mode: "publish" }), "invalid_mode"],
      [payload({ policyRef: "" }), "invalid_policy_ref"],
      [payload({ profileRef: "" }), "invalid_profile_ref"],
      [payload({ requestedMaxEffort: "unknown" }), "invalid_effort"],
      [payload({ budget: budget({ maxTokens: -1 }) }), "invalid_budget"],
    ];

    for (const [invalidPayload, reason] of cases) {
      assertDecodingFailure(
        await decodeAndAuthorize({ payload: invalidPayload }),
        reason,
      );
    }
  });

  it("maps every authorization refusal class to authorization / not_authorized", async () => {
    let getterInvoked = false;
    const hostilePrincipal = {};
    Object.defineProperty(hostilePrincipal, "principalId", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("principal getter must not run");
      },
    });

    const cases: readonly Partial<LoopRuntimePublicRequestAuthorizedEntryInput>[] = [
      { principal: { principalId: "" } },
      { principal: hostilePrincipal as LoopRuntimeAuthenticatedPrincipal },
      { authorizer: null as unknown as LoopRuntimePublicRequestAuthorizer },
      {
        authorizer: {
          authorize() {
            throw new Error("secret sync failure");
          },
        },
      },
      {
        authorizer: {
          async authorize() {
            throw new Error("secret async failure");
          },
        },
      },
      { authorizer: authorizer({ authorized: false, reason: "missing_permission" }) },
      { authorizer: authorizer({ authorized: false, reason: "not_authorized" }) },
    ];

    for (const input of cases) {
      const result = await decodeAndAuthorize(input);

      assertAuthorizationFailure(result);
      assertNoForbiddenFields(result);
    }
    assert.equal(getterInvoked, false);
  });

  it("never invokes the authorizer when decoding fails", async () => {
    const calls = { count: 0 };
    const result = await decodeAndAuthorize({
      payload: payload({ executable: "node" }),
      authorizer: authorizer({ authorized: true }, calls),
    });

    assertDecodingFailure(result, "unexpected_request_field");
    assert.equal(calls.count, 0);
  });

  it("invokes the authorizer exactly once in success and denial", async () => {
    const successCalls = { count: 0 };
    const denialCalls = { count: 0 };

    assertSuccess(
      await decodeAndAuthorize({
        authorizer: authorizer({ authorized: true }, successCalls),
      }),
    );
    assertAuthorizationFailure(
      await decodeAndAuthorize({
        authorizer: authorizer(
          { authorized: false, reason: "not_authorized" },
          denialCalls,
        ),
      }),
    );
    assert.equal(successCalls.count, 1);
    assert.equal(denialCalls.count, 1);
  });

  it("preserves this and sends the exact authorization request surface", async () => {
    const seen = { request: null as unknown };
    const injectedAuthorizer = {
      marker: "authorizer-instance",
      authorize(this: { marker: string }, authorizationRequest: unknown) {
        assert.equal(this.marker, "authorizer-instance");
        seen.request = authorizationRequest;
        return { authorized: true };
      },
    };
    const result = await decodeAndAuthorize({ authorizer: injectedAuthorizer });

    assertSuccess(result);
    assert.deepEqual(seen.request, {
      principalId: "principal.raw ",
      project: " loop-engine ",
      policyRef: " policy.ref ",
      profileRef: " profile.ref ",
      mode: "execute",
    });
    assert.deepEqual(Reflect.ownKeys(seen.request as object), [
      "principalId",
      "project",
      "policyRef",
      "profileRef",
      "mode",
    ]);
  });

  it("returns the canonical decoded request by identity without preserving payload references", async () => {
    const rawPayload = payload({ cycleId: undefined });
    const rawBudget = rawPayload.budget;
    const result = await decodeAndAuthorize({ payload: rawPayload });

    assertSuccess(result);
    assert.equal(result.request, result.request);
    assert.notEqual(result.request, rawPayload);
    assert.notEqual(result.request.budget, rawBudget);
    assert.equal(Object.isFrozen(result.request), true);
    assert.equal(Object.isFrozen(result.request.budget), true);
    assert.equal("cycleId" in result.request, false);
    assertNoForbiddenFields({ authorized: result.authorized });
    assert.equal("principal" in result, false);
    assert.equal("authorizer" in result, false);
  });

  it("keeps exact success and failure surfaces", async () => {
    const success = await decodeAndAuthorize();
    const decoding = await decodeAndAuthorize({ payload: null });
    const authorization = await decodeAndAuthorize({
      authorizer: authorizer({ authorized: false, reason: "not_authorized" }),
    });

    assertSuccess(success);
    assertDecodingFailure(decoding, "invalid_request_object");
    assertAuthorizationFailure(authorization);
    assert.deepEqual(Object.keys(success), ["authorized", "request"]);
    assert.deepEqual(Object.keys(decoding), ["authorized", "stage", "reason"]);
    assert.deepEqual(Object.keys(authorization), [
      "authorized",
      "stage",
      "reason",
    ]);
    assertNoForbiddenFields(decoding);
    assertNoForbiddenFields(authorization);
  });

  it("accepts frozen inputs without mutation and remains deterministic", async () => {
    const frozenPayload = Object.freeze({
      ...payload(),
      budget: Object.freeze(budget()),
    });
    const frozenInput = Object.freeze({
      principal: Object.freeze(principal()),
      payload: frozenPayload,
      authorizer: Object.freeze(authorizer({ authorized: true })),
    });
    const principalBefore = cloneJson(frozenInput.principal);
    const payloadBefore = cloneJson(frozenInput.payload);
    const authorizerKeysBefore = Reflect.ownKeys(frozenInput.authorizer);
    const first = await decodeAndAuthorizeLoopRuntimePublicRequest(frozenInput);
    const second = await decodeAndAuthorizeLoopRuntimePublicRequest(frozenInput);

    assert.deepEqual(frozenInput.principal, principalBefore);
    assert.deepEqual(frozenInput.payload, payloadBefore);
    assert.deepEqual(Reflect.ownKeys(frozenInput.authorizer), authorizerKeysBefore);
    assert.deepEqual(first, second);
    assertSuccess(first);
    assertSuccess(second);
  });

  it("contains only one decode call, one authorization facade call, and no downstream coupling", () => {
    const source = readFileSync(
      "src/core/loop-runtime-public-request-authorized-entry.ts",
      "utf8",
    );

    assert.equal(
      source.match(/\bdecodeLoopRuntimePublicRequest\(/g)?.length,
      1,
    );
    assert.equal(
      source.match(/\bauthorizeLoopRuntimePublicRequest\(/g)?.length,
      1,
    );
    assert.match(source, /request: decodeResult\.request/);
    assert.equal(source.includes(".authorize("), false);

    for (const forbidden of [
      "createLoopRuntimePublicRequestAuthorizationRequest",
      "evaluateLoopRuntimePublicRequestAuthorization",
      "resolveLoopRuntimePublicRequestReferences",
      "createLoopRuntimeResolvedRequestConfiguration",
      "applyLoopRuntimeInternalLimits",
      "createLoopRuntimeExecutionPlan",
      "mapLoopRuntimeExecutionPlanToRequestOptions",
      "createLoopRuntimeRequestFromPublicOptions",
      "prepareLoopRuntimePublicRequest",
      "decodeAndPrepareLoopRuntimePublicRequest",
      "../runtime/",
      "../agents/",
      "../policy/",
      "../authorization/",
      "../authority/",
      "../transports/",
      "runtime-execution-bridge",
      "node:fs",
      "node:child_process",
      "process.env",
      "fetch(",
      "setTimeout",
      "Date.now",
      "new Date",
      "Math.random",
      "crypto.randomUUID",
      "retry",
      "fallback",
      "cache",
    ]) {
      assert.equal(source.includes(forbidden), false, `${forbidden} absent`);
    }
  });

  it("exports the authorized entry facade through Core", () => {
    assert.equal(typeof decodeAndAuthorizeLoopRuntimePublicRequest, "function");
  });
});
