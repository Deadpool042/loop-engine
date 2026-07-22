import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  createLoopRuntimeAuthorizedEngineAssemblyRequest,
  type LoopRuntimeAuthenticatedPrincipal,
  type LoopRuntimeAuthorizedEngineAssembler,
  type LoopRuntimeAuthorizedEngineAssembly,
  type LoopRuntimeAuthorizedEngineAssemblyFailureReason,
  type LoopRuntimeAuthorizedEngineAssemblyRequestCreationResult,
  type LoopRuntimeAuthorizedEngineAssemblyResult,
  type LoopRuntimePublicRequest,
} from "../../src/core/index.js";

function principal(
  principalId = " principal.raw ",
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

function create(
  inputPrincipal: LoopRuntimeAuthenticatedPrincipal,
  inputRequest: LoopRuntimePublicRequest,
): LoopRuntimeAuthorizedEngineAssemblyRequestCreationResult {
  return createLoopRuntimeAuthorizedEngineAssemblyRequest(
    inputPrincipal,
    inputRequest,
  );
}

function assertCreated(
  result: LoopRuntimeAuthorizedEngineAssemblyRequestCreationResult,
): asserts result is Extract<
  LoopRuntimeAuthorizedEngineAssemblyRequestCreationResult,
  { created: true }
> {
  assert.equal(result.created, true);
}

function assertInvalid(
  inputPrincipal: unknown,
  inputRequest = request(),
): void {
  assert.deepEqual(
    create(
      inputPrincipal as LoopRuntimeAuthenticatedPrincipal,
      inputRequest,
    ),
    {
      created: false,
      reason: "invalid_assembly_context",
    },
  );
}

function sortedKeys(value: object): readonly string[] {
  return Object.keys(value).sort();
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNoForbiddenFields(value: unknown): void {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    "payload",
    "authorizer",
    "authorizationDecision",
    "token",
    "credentials",
    "credential",
    "secret",
    "roles",
    "role",
    "permissions",
    "permission",
    "policyId",
    "profileId",
    "runtimeId",
    "executable",
    "arguments",
    "cwd",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} absent`);
  }
}

describe("createLoopRuntimeAuthorizedEngineAssemblyRequest", () => {
  it("creates an authorized engine assembly context for execute mode", () => {
    const publicRequest = request();
    const result = create(principal(), publicRequest);

    assertCreated(result);
    assert.deepEqual(result.assemblyRequest, {
      principalId: " principal.raw ",
      request: publicRequest,
    });
    assert.equal(result.assemblyRequest.request, publicRequest);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.assemblyRequest), true);
  });

  it("creates an authorized engine assembly context for dry-run mode", () => {
    const publicRequest = request({ mode: "dry-run" });
    const result = create(principal("principal.dry"), publicRequest);

    assertCreated(result);
    assert.equal(result.assemblyRequest.principalId, "principal.dry");
    assert.equal(result.assemblyRequest.request.mode, "dry-run");
  });

  it("keeps the assembly context surface exact and does not flatten request fields", () => {
    const result = create(principal(), request());

    assertCreated(result);
    assert.deepEqual(sortedKeys(result.assemblyRequest), [
      "principalId",
      "request",
    ]);
    assert.equal("project" in result.assemblyRequest, false);
    assert.equal("policyRef" in result.assemblyRequest, false);
    assert.equal("profileRef" in result.assemblyRequest, false);
    assert.equal("mode" in result.assemblyRequest, false);
  });

  it("rejects invalid principals and invalid principal ids", () => {
    assertInvalid(null);
    assertInvalid([]);
    assertInvalid(Object.assign(Object.create({}), { principalId: "p" }));
    assertInvalid(Object.assign(Object.create(null), { principalId: "p" }));
    assertInvalid({ principalId: "" });
    assertInvalid({ principalId: "   " });
    assertInvalid({ principalId: 123 });
    assertInvalid({ principalId: "principal", extra: true });
  });

  it("rejects hostile principal getters without invoking them", () => {
    let getterInvoked = false;
    const hostilePrincipal = {};

    Object.defineProperty(hostilePrincipal, "principalId", {
      enumerable: true,
      get() {
        getterInvoked = true;
        throw new Error("principal getter must not run");
      },
    });

    assertInvalid(hostilePrincipal);
    assert.equal(getterInvoked, false);
  });

  it("rejects invalid public requests", () => {
    assertInvalid(principal(), null as unknown as LoopRuntimePublicRequest);
    assertInvalid(principal(), request({ project: "" }));
    assertInvalid(principal(), request({ policyRef: "" }));
    assertInvalid(principal(), request({ profileRef: "" }));
    assertInvalid(principal(), request({
      mode: "publish" as LoopRuntimePublicRequest["mode"],
    }));
    assertInvalid(principal(), request({
      requestedMaxEffort:
        "unknown" as LoopRuntimePublicRequest["requestedMaxEffort"],
    }));
    assertInvalid(principal(), request({
      budget: {
        ...request().budget,
        maxCalls: -1,
      },
    }));
  });

  it("accepts frozen canonical requests and frozen principals", () => {
    const frozenRequest = Object.freeze({
      ...request({ cycleId: undefined }),
      budget: Object.freeze(request().budget),
    });
    const frozenPrincipal = Object.freeze(principal("principal.frozen"));

    const result = create(frozenPrincipal, frozenRequest);

    assertCreated(result);
    assert.equal(result.assemblyRequest.principalId, "principal.frozen");
    assert.equal(result.assemblyRequest.request, frozenRequest);
  });

  it("does not expose payload, authorization objects, credentials, or internal engine data", () => {
    const result = create(principal(), request());

    assertCreated(result);
    assertNoForbiddenFields(result.assemblyRequest);
  });

  it("does not mutate inputs and remains deterministic", () => {
    const inputPrincipal = principal(" principal-untrimmed ");
    const inputRequest = request();
    const principalBefore = cloneJson(inputPrincipal);
    const requestBefore = cloneJson(inputRequest);

    const first = create(inputPrincipal, inputRequest);
    const second = create(inputPrincipal, inputRequest);

    assert.deepEqual(inputPrincipal, principalBefore);
    assert.deepEqual(inputRequest, requestBefore);
    assert.deepEqual(first, second);
  });
});

describe("LoopRuntimeAuthorizedEngineAssembly contracts", () => {
  it("models catalog, limits, and binding as internal assembly data", () => {
    const assembly: LoopRuntimeAuthorizedEngineAssembly = Object.freeze({
      catalog: Object.freeze({
        policies: Object.freeze([
          Object.freeze({
            ref: "policy.ref",
            value: Object.freeze({
              policyRef: "policy.ref",
              policyId: "policy.internal",
            }),
          }),
        ]),
        profiles: Object.freeze([
          Object.freeze({
            ref: "profile.ref",
            value: Object.freeze({
              profileRef: "profile.ref",
              profileId: "profile.internal",
              maxEffort: "medium",
            }),
          }),
        ]),
      }),
      limits: Object.freeze({
        maxEffort: "medium",
        budget: Object.freeze({
          maxTokens: 10,
          maxCostUsd: 1,
          maxDurationMs: 1_000,
          maxCalls: 1,
          maxRepairs: 0,
        }),
      }),
      binding: Object.freeze({
        runtimeId: "runtime.local-process",
        executable: "node",
        arguments: Object.freeze(["--version"]),
        cwd: ".",
      }),
    });

    assert.deepEqual(sortedKeys(assembly), ["binding", "catalog", "limits"]);
    assert.equal(assembly.catalog.policies[0]?.value.policyId, "policy.internal");
    assert.equal(assembly.catalog.profiles[0]?.value.profileId, "profile.internal");
    assert.equal(assembly.binding.runtimeId, "runtime.local-process");
  });

  it("keeps assembly success and failure result surfaces exact", () => {
    const assembly = Object.freeze({
      catalog: Object.freeze({
        policies: Object.freeze([]),
        profiles: Object.freeze([]),
      }),
      limits: Object.freeze({
        maxEffort: "low" as const,
        budget: Object.freeze({
          maxTokens: 0,
          maxCostUsd: 0,
          maxDurationMs: 0,
          maxCalls: 0,
          maxRepairs: 0,
        }),
      }),
      binding: Object.freeze({
        runtimeId: "runtime.local-process",
        executable: "node",
        arguments: Object.freeze([]),
      }),
    });
    const success: LoopRuntimeAuthorizedEngineAssemblyResult = Object.freeze({
      assembled: true as const,
      assembly,
    });
    const failures: readonly LoopRuntimeAuthorizedEngineAssemblyResult[] = [
      Object.freeze({
        assembled: false as const,
        reason: "assembly_unavailable" as const,
      }),
      Object.freeze({
        assembled: false as const,
        reason: "assembly_ambiguous" as const,
      }),
      Object.freeze({
        assembled: false as const,
        reason: "invalid_assembly" as const,
      }),
    ];

    assert.deepEqual(sortedKeys(success), ["assembled", "assembly"]);
    assert.equal(success.assembly, assembly);

    for (const failure of failures) {
      assert.deepEqual(sortedKeys(failure), ["assembled", "reason"]);
      assert.equal(failure.assembled, false);
      assert.match(failure.reason, /^assembly_unavailable|assembly_ambiguous|invalid_assembly$/);
      assertNoForbiddenFields(failure);
    }
  });

  it("limits assembly failure reasons to stable non-sensitive values", () => {
    const reasons: readonly LoopRuntimeAuthorizedEngineAssemblyFailureReason[] = [
      "assembly_unavailable",
      "assembly_ambiguous",
      "invalid_assembly",
    ];

    assert.deepEqual(reasons, [
      "assembly_unavailable",
      "assembly_ambiguous",
      "invalid_assembly",
    ]);

    for (const reason of reasons) {
      for (const forbidden of [
        "unknown_policy",
        "unknown_profile",
        "missing_binding",
        "executable",
        "cwd",
        "permission",
        "tenant",
        "provider",
        "model",
      ]) {
        assert.equal(reason.includes(forbidden), false);
      }
    }
  });

  it("defines a port compatible with synchronous and asynchronous assembly results", () => {
    const result: LoopRuntimeAuthorizedEngineAssemblyResult = Object.freeze({
      assembled: false,
      reason: "assembly_unavailable",
    });
    const syncAssembler: LoopRuntimeAuthorizedEngineAssembler = {
      assemble() {
        return result;
      },
    };
    const asyncAssembler: LoopRuntimeAuthorizedEngineAssembler = {
      async assemble() {
        return result;
      },
    };

    assert.equal(typeof syncAssembler.assemble, "function");
    assert.equal(typeof asyncAssembler.assemble, "function");
  });

  it("contains no concrete assembler, port invocation, defaults, or downstream coupling", () => {
    const source = readFileSync(
      new URL(
        "../../src/core/loop-runtime-public-request-engine-assembly.ts",
        import.meta.url,
      ),
      "utf8",
    );

    assert.equal(source.includes(".assemble("), false);
    assert.equal(source.includes("defaultCatalog"), false);
    assert.equal(source.includes("defaultLimits"), false);
    assert.equal(source.includes("defaultBinding"), false);
    assert.equal(source.includes("prepareLoopRuntimePublicRequest"), false);

    for (const forbidden of [
      "runtime-execution-bridge",
      "../runtime/",
      "../agents/",
      "../transports/",
      "../policy/",
      "node:child_process",
      "node:process",
      "process.env",
      "fetch(",
      "Date.",
      "Math.random",
    ]) {
      assert.equal(source.includes(forbidden), false, `${forbidden} absent`);
    }
  });

  it("exports the engine assembly contract through Core", () => {
    assert.equal(
      typeof createLoopRuntimeAuthorizedEngineAssemblyRequest,
      "function",
    );
  });
});
