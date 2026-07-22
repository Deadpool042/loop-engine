import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  createLoopRuntimeRequestFromPublicOptions,
  prepareLoopRuntimePublicRequest,
  type LoopRuntimeInternalLimits,
  type LoopRuntimePublicRequest,
  type LoopRuntimePublicRequestPreparationInput,
  type LoopRuntimePublicRequestPreparationResult,
  type LoopRuntimeRequestBinding,
  type LoopRuntimeRequestOptionsMapping,
} from "../../src/core/index.js";

function buildRequest(
  overrides: Partial<LoopRuntimePublicRequest> = {},
): LoopRuntimePublicRequest {
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
  overrides: Partial<LoopRuntimePublicRequestPreparationInput> = {},
): LoopRuntimePublicRequestPreparationInput {
  const request = overrides.request ?? buildRequest();

  return {
    request,
    catalog: {
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
    },
    limits: buildLimits(),
    binding: buildBinding(),
    ...overrides,
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertFailure(
  result: LoopRuntimePublicRequestPreparationResult,
  stage: string,
  reason: string,
): void {
  assert.deepEqual(result, {
    prepared: false,
    stage,
    reason,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal("runtimeRequest" in result, false);
}

describe("prepareLoopRuntimePublicRequest", () => {
  it("prepares an execute runtime request through the existing pipeline", () => {
    const input = buildInput();
    const before = cloneJson(input);
    const result = prepareLoopRuntimePublicRequest(input);
    const expectedOptions: LoopRuntimeRequestOptionsMapping = {
      project: "loop-engine",
      mode: "execute",
      policyId: "policy-id",
      profileId: "profile-id",
      effort: "medium",
      limits: {
        maxTokens: 5,
        maxCostUsd: 6,
        maxDurationMs: 7,
        maxCalls: 8,
        maxRepairs: 9,
      },
    };
    const expected = createLoopRuntimeRequestFromPublicOptions(
      expectedOptions,
      input.binding,
    );

    assert.equal(result.prepared, true);
    assert.equal(expected.constructed, true);
    if (!result.prepared || !expected.constructed) {
      throw new Error("expected prepared runtime request");
    }

    assert.deepEqual(result.runtimeRequest, expected.request);
    assert.deepEqual(Object.keys(result), ["prepared", "runtimeRequest"]);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.runtimeRequest), true);
    assert.equal("resolution" in result, false);
    assert.equal("configuration" in result, false);
    assert.equal("plan" in result, false);
    assert.equal("options" in result, false);
    assert.deepEqual(input, before);
  });

  it("stops on invalid public request before later stages", () => {
    const result = prepareLoopRuntimePublicRequest(
      buildInput({
        request: buildRequest({ project: "   " }),
        limits: buildLimits({
          budget: {
            ...buildLimits().budget,
            maxTokens: -1,
          },
        }),
        binding: buildBinding({ executable: "   " }),
      }),
    );

    assertFailure(result, "resolution", "invalid_request");
  });

  it("stops on unknown and ambiguous policy refs", () => {
    assertFailure(
      prepareLoopRuntimePublicRequest(
        buildInput({
          catalog: {
            policies: [],
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
          },
        }),
      ),
      "resolution",
      "unknown_policy_ref",
    );

    assertFailure(
      prepareLoopRuntimePublicRequest(
        buildInput({
          catalog: {
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
          },
        }),
      ),
      "resolution",
      "ambiguous_policy_ref",
    );
  });

  it("stops on unknown and ambiguous profile refs", () => {
    assertFailure(
      prepareLoopRuntimePublicRequest(
        buildInput({
          catalog: {
            policies: [
              {
                ref: "policy.ref",
                value: {
                  policyRef: "policy.ref",
                  policyId: "policy-id",
                },
              },
            ],
            profiles: [],
          },
        }),
      ),
      "resolution",
      "unknown_profile_ref",
    );

    assertFailure(
      prepareLoopRuntimePublicRequest(
        buildInput({
          catalog: {
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
          },
        }),
      ),
      "resolution",
      "ambiguous_profile_ref",
    );
  });

  it("stops on internal limit failures", () => {
    const result = prepareLoopRuntimePublicRequest(
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
    );

    assertFailure(result, "limits", "invalid_internal_limits");
  });

  it("stops on planning failures before options mapping or request construction", () => {
    const result = prepareLoopRuntimePublicRequest(
      buildInput({
        catalog: {
          policies: [
            {
              ref: "policy.ref",
              value: {
                policyRef: "policy.ref",
                policyId: "   ",
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
        },
        binding: buildBinding({ executable: "   " }),
      }),
    );

    assertFailure(result, "planning", "invalid_limited_configuration");
  });

  it("passes dry-run through to runtime request construction", () => {
    const result = prepareLoopRuntimePublicRequest(
      buildInput({
        request: buildRequest({ mode: "dry-run" }),
      }),
    );

    assertFailure(result, "request_construction", "unsupported_dry_run");
  });

  it("stops on invalid binding during request construction", () => {
    const result = prepareLoopRuntimePublicRequest(
      buildInput({
        binding: buildBinding({ executable: "   " }),
      }),
    );

    assertFailure(result, "request_construction", "invalid_binding");
  });

  it("accepts frozen inputs without mutation and remains deterministic", () => {
    const request = Object.freeze({
      ...buildRequest({ cycleId: "cycle-1" }),
      budget: Object.freeze(buildRequest().budget),
    }) as LoopRuntimePublicRequest;
    const policy = Object.freeze({
      policyRef: "policy.ref",
      policyId: "policy-id",
    });
    const profile = Object.freeze({
      profileRef: "profile.ref",
      profileId: "profile-id",
      maxEffort: "medium" as const,
    });
    const input = Object.freeze({
      request,
      catalog: Object.freeze({
        policies: Object.freeze([
          Object.freeze({
            ref: "policy.ref",
            value: policy,
          }),
        ]),
        profiles: Object.freeze([
          Object.freeze({
            ref: "profile.ref",
            value: profile,
          }),
        ]),
      }),
      limits: Object.freeze({
        ...buildLimits(),
        budget: Object.freeze(buildLimits().budget),
      }),
      binding: Object.freeze({
        ...buildBinding(),
        arguments: Object.freeze(["--version"]),
      }),
    }) as LoopRuntimePublicRequestPreparationInput;
    const before = cloneJson(input);
    const first = prepareLoopRuntimePublicRequest(input);
    const second = prepareLoopRuntimePublicRequest(input);

    assert.deepEqual(first, second);
    assert.deepEqual(input, before);
    assert.equal(Object.isFrozen(first), true);
  });

  it("keeps configuration and options mapping as explicit fail-closed stages", () => {
    const source = readFileSync(
      "src/core/loop-runtime-public-request-preparation.ts",
      "utf8",
    );

    assert.match(
      source,
      /failPreparation\("configuration", configuration\.reason\)/,
    );
    assert.match(
      source,
      /failPreparation\("options_mapping", requestOptions\.reason\)/,
    );
  });

  it("does not import execution, bridge, agent, transport, process, or I/O modules", () => {
    const source = readFileSync(
      "src/core/loop-runtime-public-request-preparation.ts",
      "utf8",
    );

    for (const forbidden of [
      "../runtime/",
      "../agents/",
      "../transports/",
      "runtime-execution-bridge",
      "child_process",
      "node:fs",
      "process.env",
      "fetch",
      "sender",
      "transport",
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });
});
