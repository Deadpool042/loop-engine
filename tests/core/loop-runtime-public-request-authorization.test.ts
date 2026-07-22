import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  createLoopRuntimePublicRequestAuthorizationRequest,
  type LoopRuntimeAuthenticatedPrincipal,
  type LoopRuntimePublicRequest,
  type LoopRuntimePublicRequestAuthorizationDecision,
  type LoopRuntimePublicRequestAuthorizationRequest,
  type LoopRuntimePublicRequestAuthorizationRequestCreationResult,
  type LoopRuntimePublicRequestAuthorizer,
} from "../../src/core/index.js";

function validPrincipal(
  principalId = "principal.raw ",
): LoopRuntimeAuthenticatedPrincipal {
  return {
    principalId,
  };
}

function validRequest(
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

function create(
  principal: LoopRuntimeAuthenticatedPrincipal,
  request: LoopRuntimePublicRequest,
): LoopRuntimePublicRequestAuthorizationRequestCreationResult {
  return createLoopRuntimePublicRequestAuthorizationRequest(principal, request);
}

function assertCreated(
  result: LoopRuntimePublicRequestAuthorizationRequestCreationResult,
): asserts result is Extract<
  LoopRuntimePublicRequestAuthorizationRequestCreationResult,
  { created: true }
> {
  assert.equal(result.created, true);
}

function assertInvalid(
  principal: unknown,
  request = validRequest(),
): void {
  assert.deepEqual(
    create(
      principal as LoopRuntimeAuthenticatedPrincipal,
      request,
    ),
    {
      created: false,
      reason: "invalid_authorization_context",
    },
  );
}

function keysOf(value: object): readonly PropertyKey[] {
  return Reflect.ownKeys(value).sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
}

describe("createLoopRuntimePublicRequestAuthorizationRequest", () => {
  it("creates a minimal authorization request for execute mode", () => {
    const result = create(validPrincipal(), validRequest());

    assertCreated(result);
    assert.deepEqual(result.authorizationRequest, {
      principalId: "principal.raw ",
      project: " loop-engine ",
      policyRef: " policy.ref ",
      profileRef: " profile.ref ",
      mode: "execute",
    });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.authorizationRequest), true);
  });

  it("creates a minimal authorization request for dry-run mode", () => {
    const result = create(validPrincipal("principal.dry"), validRequest({
      mode: "dry-run",
    }));

    assertCreated(result);
    assert.equal(result.authorizationRequest.mode, "dry-run");
    assert.equal(result.authorizationRequest.principalId, "principal.dry");
  });

  it("requires the principal surface to contain exactly principalId", () => {
    assert.deepEqual(keysOf(validPrincipal()), ["principalId"]);
    assertInvalid({ principalId: "principal", extra: true });
    assertInvalid({ principalId: "principal", permissions: ["read_only"] });
    assertInvalid({ principalId: "principal", roles: ["admin"] });
  });

  it("creates an authorization request with exactly the public authorization fields", () => {
    const result = create(validPrincipal(), validRequest());

    assertCreated(result);
    assert.deepEqual(keysOf(result.authorizationRequest), [
      "mode",
      "policyRef",
      "principalId",
      "profileRef",
      "project",
    ]);
  });

  it("rejects empty, whitespace-only, and non-string principalId values", () => {
    assertInvalid({ principalId: "" });
    assertInvalid({ principalId: "   " });
    assertInvalid({ principalId: 123 });
  });

  it("rejects invalid principal shapes", () => {
    assertInvalid(null);
    assertInvalid([]);
    assertInvalid(Object.assign(Object.create({}), { principalId: "p" }));
    assertInvalid(Object.assign(Object.create(null), { principalId: "p" }));
  });

  it("rejects symbolic keys and accessor properties without invoking getters", () => {
    const symbol = Symbol("secret");
    assertInvalid({ principalId: "principal", [symbol]: true });

    let getterInvoked = false;
    const accessorPrincipal = {};
    Object.defineProperty(accessorPrincipal, "principalId", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return "principal";
      },
    });

    assertInvalid(accessorPrincipal);
    assert.equal(getterInvoked, false);

    let hostileGetterInvoked = false;
    const hostilePrincipal = {};
    Object.defineProperty(hostilePrincipal, "principalId", {
      enumerable: true,
      get() {
        hostileGetterInvoked = true;
        throw new Error("getter must not run");
      },
    });

    assertInvalid(hostilePrincipal);
    assert.equal(hostileGetterInvoked, false);
  });

  it("rejects non-enumerable principalId properties", () => {
    const principal = {};
    Object.defineProperty(principal, "principalId", {
      value: "principal",
      enumerable: false,
    });

    assertInvalid(principal);
  });

  it("accepts frozen principals and frozen decoded requests", () => {
    const principal = Object.freeze(validPrincipal("principal.frozen"));
    const request = Object.freeze({
      ...validRequest({ cycleId: undefined }),
      budget: Object.freeze(validRequest().budget),
    });

    const result = create(principal, request);

    assertCreated(result);
    assert.equal(result.authorizationRequest.principalId, "principal.frozen");
  });

  it("maps every invalid V13.49 request to invalid_authorization_context", () => {
    const invalidRequests: readonly LoopRuntimePublicRequest[] = [
      null as unknown as LoopRuntimePublicRequest,
      validRequest({ schemaVersion: 2 as unknown as 1 }),
      validRequest({ project: "" }),
      validRequest({ cycleId: "" }),
      validRequest({ mode: "publish" as LoopRuntimePublicRequest["mode"] }),
      validRequest({ policyRef: "" }),
      validRequest({ profileRef: "" }),
      validRequest({ requestedMaxEffort: "unknown" as LoopRuntimePublicRequest["requestedMaxEffort"] }),
      validRequest({ budget: { ...validRequest().budget, maxTokens: -1 } }),
    ];

    for (const request of invalidRequests) {
      assert.deepEqual(create(validPrincipal(), request), {
        created: false,
        reason: "invalid_authorization_context",
      });
    }
  });

  it("excludes non-authorization public fields and internal identifiers", () => {
    const result = create(validPrincipal(), validRequest());

    assertCreated(result);
    const serialized = JSON.stringify(result.authorizationRequest);

    for (const forbidden of [
      "cycleId",
      "requestedMaxEffort",
      "budget",
      "policyId",
      "profileId",
      "catalog",
      "limits",
      "binding",
      "runtimeId",
      "executable",
      "arguments",
      "cwd",
      "token",
      "apiKey",
      "credential",
      "secret",
      "password",
      "cookie",
      "authorizationHeader",
      "session",
      "permissions",
      "roles",
      "claims",
      "transport",
    ]) {
      assert.equal(
        serialized.includes(forbidden),
        false,
        `${forbidden} must be absent`,
      );
    }
  });

  it("propagates strings without normalization and does not mutate inputs", () => {
    const principal = validPrincipal(" principal-untrimmed ");
    const request = validRequest();
    const principalBefore = JSON.stringify(principal);
    const requestBefore = JSON.stringify(request);

    const first = create(principal, request);
    const second = create(principal, request);

    assertCreated(first);
    assertCreated(second);
    assert.deepEqual(first, second);
    assert.equal(first.authorizationRequest.principalId, " principal-untrimmed ");
    assert.equal(first.authorizationRequest.project, " loop-engine ");
    assert.equal(first.authorizationRequest.policyRef, " policy.ref ");
    assert.equal(first.authorizationRequest.profileRef, " profile.ref ");
    assert.equal(JSON.stringify(principal), principalBefore);
    assert.equal(JSON.stringify(request), requestBefore);
  });

  it("converts principal inspection exceptions to invalid_authorization_context", () => {
    const proxy = new Proxy(
      { principalId: "principal" },
      {
        getPrototypeOf() {
          throw new Error("hostile proxy");
        },
      },
    );

    assertInvalid(proxy);
  });

  it("defines a sync and async authorizer port without invoking it", () => {
    const authorizationRequest: LoopRuntimePublicRequestAuthorizationRequest = {
      principalId: "principal",
      project: "loop-engine",
      policyRef: "policy.ref",
      profileRef: "profile.ref",
      mode: "execute",
    };

    if (false) {
      const syncAuthorizer: LoopRuntimePublicRequestAuthorizer = {
        authorize(
          request: LoopRuntimePublicRequestAuthorizationRequest,
        ): LoopRuntimePublicRequestAuthorizationDecision {
          void request;
          return { authorized: true };
        },
      };
      const asyncAuthorizer: LoopRuntimePublicRequestAuthorizer = {
        async authorize(
          request: LoopRuntimePublicRequestAuthorizationRequest,
        ): Promise<LoopRuntimePublicRequestAuthorizationDecision> {
          void request;
          return { authorized: false, reason: "not_authorized" };
        },
      };

      void syncAuthorizer;
      void asyncAuthorizer;
      void authorizationRequest;
    }

    assert.equal(authorizationRequest.mode, "execute");
  });

  it("does not implement or invoke an authorizer and stays decoupled from execution layers", () => {
    const source = readFileSync(
      "src/core/loop-runtime-public-request-authorization.ts",
      "utf8",
    );

    assert.equal(source.includes(".authorize("), false);
    assert.equal(/const\s+\w*Authorizer|function\s+\w*Authorizer/.test(source), false);
    assert.equal(source.includes("allow-all"), false);
    assert.equal(source.includes("deny-all"), false);

    for (const forbiddenImport of [
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
      assert.equal(
        source.includes(forbiddenImport),
        false,
        `${forbiddenImport} must not be imported or referenced`,
      );
    }
  });

  it("exports the function and public types through Core", () => {
    assert.equal(
      typeof createLoopRuntimePublicRequestAuthorizationRequest,
      "function",
    );

    const principal: LoopRuntimeAuthenticatedPrincipal = {
      principalId: "principal",
    };
    const result: LoopRuntimePublicRequestAuthorizationRequestCreationResult =
      createLoopRuntimePublicRequestAuthorizationRequest(
        principal,
        validRequest(),
      );

    assert.equal(result.created, true);
  });
});
