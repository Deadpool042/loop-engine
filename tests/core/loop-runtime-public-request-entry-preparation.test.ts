import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  decodeAndPrepareLoopRuntimePublicRequest,
  decodeLoopRuntimePublicRequest,
  prepareLoopRuntimePublicRequest,
  type LoopRuntimeInternalLimits,
  type LoopRuntimePublicRequestEntryPreparationInput,
  type LoopRuntimePublicRequestEntryPreparationResult,
  type LoopRuntimePublicRequestReferenceCatalog,
  type LoopRuntimeRequestBinding,
  type LoopRuntimeResolvedPolicyConfiguration,
  type LoopRuntimeResolvedProfileConfiguration,
} from "../../src/core/index.js";

function buildPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: "loop-engine",
    mode: "execute",
    policyRef: "policy.ref",
    profileRef: "profile.ref",
    requestedMaxEffort: "high",
    budget: {
      maxTokens: 10,
      maxCostUsd: 20,
      maxDurationMs: 30,
      maxCalls: 40,
      maxRepairs: 50,
    },
    ...overrides,
  };
}

function buildCatalog(
  overrides: Partial<
    LoopRuntimePublicRequestReferenceCatalog<
      LoopRuntimeResolvedPolicyConfiguration,
      LoopRuntimeResolvedProfileConfiguration
    >
  > = {},
): LoopRuntimePublicRequestReferenceCatalog<
  LoopRuntimeResolvedPolicyConfiguration,
  LoopRuntimeResolvedProfileConfiguration
> {
  return {
    policies: [
      {
        ref: "policy.ref",
        value: {
          policyRef: "policy.ref",
          policyId: "policy-id",
        },
      },
    ],
    profiles: [
      {
        ref: "profile.ref",
        value: {
          profileRef: "profile.ref",
          profileId: "profile-id",
          maxEffort: "medium",
        },
      },
    ],
    ...overrides,
  };
}

function buildLimits(
  overrides: Partial<LoopRuntimeInternalLimits> = {},
): LoopRuntimeInternalLimits {
  return {
    maxEffort: "medium",
    budget: {
      maxTokens: 5,
      maxCostUsd: 6,
      maxDurationMs: 7,
      maxCalls: 8,
      maxRepairs: 9,
    },
    ...overrides,
  };
}

function buildBinding(
  overrides: Partial<LoopRuntimeRequestBinding> = {},
): LoopRuntimeRequestBinding {
  return {
    runtimeId: "local-process",
    executable: "node",
    arguments: ["--version"],
    cwd: ".",
    ...overrides,
  };
}

function buildInput(
  overrides: Partial<LoopRuntimePublicRequestEntryPreparationInput> = {},
): LoopRuntimePublicRequestEntryPreparationInput {
  return {
    payload: buildPayload(),
    catalog: buildCatalog(),
    limits: buildLimits(),
    binding: buildBinding(),
    ...overrides,
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertFailure(
  result: LoopRuntimePublicRequestEntryPreparationResult,
  stage: string,
  reason: string,
): void {
  assert.deepEqual(result, {
    prepared: false,
    stage,
    reason,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Object.keys(result), ["prepared", "stage", "reason"]);

  for (const forbidden of [
    "payload",
    "catalog",
    "limits",
    "binding",
    "request",
    "decoded",
    "preparation",
    "runtimeRequest",
  ]) {
    assert.equal(forbidden in result, false, forbidden);
  }
}

describe("decodeAndPrepareLoopRuntimePublicRequest", () => {
  it("decodes and prepares a valid execute payload", () => {
    const input = buildInput();
    const before = cloneJson(input);
    const result = decodeAndPrepareLoopRuntimePublicRequest(input);

    assert.equal(result.prepared, true);
    if (!result.prepared) {
      throw new Error(`expected prepared result: ${result.stage}`);
    }

    assert.deepEqual(Object.keys(result), ["prepared", "runtimeRequest"]);
    assert.equal(result.runtimeRequest.runtimeId, "local-process");
    assert.equal(result.runtimeRequest.project, "loop-engine");
    assert.equal(result.runtimeRequest.policyId, "policy-id");
    assert.equal(result.runtimeRequest.profileId, "profile-id");
    assert.equal(result.runtimeRequest.command.executable, "node");
    assert.deepEqual(result.runtimeRequest.command.arguments, ["--version"]);
    assert.equal(Object.isFrozen(result), true);
    assert.deepEqual(input, before);
  });

  it("matches the explicit V13.58 then V13.56 composition result", () => {
    const input = buildInput();
    const decoded = decodeLoopRuntimePublicRequest(input.payload);

    assert.equal(decoded.parsed, true);
    if (!decoded.parsed) {
      throw new Error(`expected decoded request: ${decoded.reason}`);
    }

    const prepared = prepareLoopRuntimePublicRequest({
      request: decoded.request,
      catalog: input.catalog,
      limits: input.limits,
      binding: input.binding,
    });
    const entryResult = decodeAndPrepareLoopRuntimePublicRequest(input);

    assert.equal(prepared.prepared, true);
    assert.equal(entryResult.prepared, true);
    if (!prepared.prepared || !entryResult.prepared) {
      throw new Error("expected both paths to prepare");
    }

    assert.deepEqual(entryResult.runtimeRequest, prepared.runtimeRequest);
  });

  it("preserves dry-run through preparation as unsupported runtime request construction", () => {
    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          payload: buildPayload({ mode: "dry-run" }),
        }),
      ),
      "request_construction",
      "unsupported_dry_run",
    );
  });

  it("stops at decoding failures before preparation", () => {
    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(buildInput({ payload: null })),
      "decoding",
      "invalid_request_object",
    );
    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(buildInput({ payload: [] })),
      "decoding",
      "invalid_request_object",
    );
    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          payload: buildPayload({ executable: "node" }),
          catalog: buildCatalog({ policies: [] }),
        }),
      ),
      "decoding",
      "unexpected_request_field",
    );
    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          payload: buildPayload({
            budget: {
              ...buildPayload().budget as Record<string, unknown>,
              unexpected: true,
            },
          }),
          catalog: buildCatalog({ policies: [] }),
        }),
      ),
      "decoding",
      "unexpected_budget_field",
    );
  });

  it("handles hostile getters and proxies during decoding without continuing", () => {
    let getterCalled = false;
    const withGetter = buildPayload();
    Object.defineProperty(withGetter, "project", {
      enumerable: true,
      get() {
        getterCalled = true;
        throw new Error("getter should not run");
      },
    });

    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          payload: withGetter,
          catalog: buildCatalog({ policies: [] }),
        }),
      ),
      "decoding",
      "invalid_request_property",
    );
    assert.equal(getterCalled, false);

    const proxy = new Proxy(buildPayload(), {
      ownKeys() {
        throw new Error("hostile ownKeys");
      },
    });
    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          payload: proxy,
          catalog: buildCatalog({ policies: [] }),
        }),
      ),
      "decoding",
      "invalid_input",
    );
  });

  it("propagates resolution failures exactly", () => {
    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          catalog: buildCatalog({ policies: [] }),
        }),
      ),
      "resolution",
      "unknown_policy_ref",
    );

    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          catalog: buildCatalog({
            policies: [
              {
                ref: "policy.ref",
                value: {
                  policyRef: "policy.ref",
                  policyId: "policy-a",
                },
              },
              {
                ref: "policy.ref",
                value: {
                  policyRef: "policy.ref",
                  policyId: "policy-b",
                },
              },
            ],
          }),
        }),
      ),
      "resolution",
      "ambiguous_policy_ref",
    );

    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          catalog: buildCatalog({ profiles: [] }),
        }),
      ),
      "resolution",
      "unknown_profile_ref",
    );

    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          catalog: buildCatalog({
            profiles: [
              {
                ref: "profile.ref",
                value: {
                  profileRef: "profile.ref",
                  profileId: "profile-a",
                  maxEffort: "medium",
                },
              },
              {
                ref: "profile.ref",
                value: {
                  profileRef: "profile.ref",
                  profileId: "profile-b",
                  maxEffort: "medium",
                },
              },
            ],
          }),
        }),
      ),
      "resolution",
      "ambiguous_profile_ref",
    );
  });

  it("propagates limits and request construction failures exactly", () => {
    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          limits: {
            ...buildLimits(),
            budget: {
              ...buildLimits().budget,
              maxCalls: -1,
            },
          },
          binding: buildBinding({ executable: "   " }),
        }),
      ),
      "limits",
      "invalid_internal_limits",
    );

    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          binding: buildBinding({ executable: "   " }),
        }),
      ),
      "request_construction",
      "invalid_binding",
    );
  });

  it("stops at the first error", () => {
    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          payload: buildPayload({ unknown: true }),
          catalog: buildCatalog({ policies: [] }),
          limits: {
            ...buildLimits(),
            budget: {
              ...buildLimits().budget,
              maxCalls: -1,
            },
          },
          binding: buildBinding({ executable: "   " }),
        }),
      ),
      "decoding",
      "unexpected_request_field",
    );

    assertFailure(
      decodeAndPrepareLoopRuntimePublicRequest(
        buildInput({
          catalog: buildCatalog({ policies: [] }),
          limits: {
            ...buildLimits(),
            budget: {
              ...buildLimits().budget,
              maxCalls: -1,
            },
          },
          binding: buildBinding({ executable: "   " }),
        }),
      ),
      "resolution",
      "unknown_policy_ref",
    );
  });

  it("accepts frozen inputs without mutating dependencies", () => {
    const input = Object.freeze({
      payload: Object.freeze({
        ...buildPayload({ cycleId: "cycle-001" }),
        budget: Object.freeze(buildPayload().budget),
      }),
      catalog: Object.freeze({
        policies: Object.freeze(buildCatalog().policies),
        profiles: Object.freeze(buildCatalog().profiles),
      }),
      limits: Object.freeze({
        ...buildLimits(),
        budget: Object.freeze(buildLimits().budget),
      }),
      binding: Object.freeze({
        ...buildBinding(),
        arguments: Object.freeze(["--version"]),
      }),
    }) as LoopRuntimePublicRequestEntryPreparationInput;
    const before = cloneJson(input);
    const first = decodeAndPrepareLoopRuntimePublicRequest(input);
    const second = decodeAndPrepareLoopRuntimePublicRequest(input);

    assert.deepEqual(input, before);
    assert.deepEqual(first, second);
    assert.equal(Object.isFrozen(first), true);
  });

  it("keeps runtime request identity propagation and avoids serialization or transport", () => {
    const source = readFileSync(
      "src/core/loop-runtime-public-request-entry-preparation.ts",
      "utf8",
    );

    assert.match(source, /runtimeRequest: preparation\.runtimeRequest/);
    assert.doesNotMatch(source, /JSON\.stringify|serialize|send\(|fetch\(/);

    for (const forbidden of [
      "../runtime/",
      "../agents/",
      "../transports/",
      "runtime-execution-bridge",
      "node:fs",
      "node:child_process",
      "process.env",
      "Date.now",
      "new Date",
      "Math.random",
      "crypto.randomUUID",
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });
});
