import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  prepareAuthorizedLoopRuntimeRequest,
  type LoopRuntimeAuthorizedEngineAssembly,
  type LoopRuntimeAuthenticatedPrincipal,
  type LoopRuntimePreparedPublicRequestEntryInput,
  type LoopRuntimePreparedPublicRequestEntryResult,
  type LoopRuntimePublicRequestAuthorizer,
} from "../../src/core/index.js";

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: "loop-engine",
    cycleId: "cycle-1",
    mode: "execute",
    policyRef: "policy.ref",
    profileRef: "profile.ref",
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

function principal(
  principalId = "principal",
): LoopRuntimeAuthenticatedPrincipal {
  return {
    principalId,
  };
}

function assembly(
  overrides: Partial<LoopRuntimeAuthorizedEngineAssembly> = {},
): LoopRuntimeAuthorizedEngineAssembly {
  return {
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
    limits: {
      maxEffort: "medium",
      budget: {
        maxTokens: 10,
        maxCostUsd: 1,
        maxDurationMs: 1_000,
        maxCalls: 1,
        maxRepairs: 0,
      },
    },
    binding: {
      runtimeId: "local-process",
      executable: "node",
      arguments: ["--version"],
    },
    ...overrides,
  };
}

function counters() {
  return {
    authorizer: 0,
    assembler: 0,
    seenAssemblyRequest: null as unknown,
    thisValue: null as unknown,
  };
}

function authorizer(
  decision: unknown,
  calls = counters(),
): LoopRuntimePublicRequestAuthorizer {
  return {
    authorize() {
      calls.authorizer += 1;
      return decision as never;
    },
  };
}

function assembler(result: unknown, calls = counters()) {
  return {
    assemble(this: unknown, assemblyRequest: unknown) {
      calls.assembler += 1;
      calls.thisValue = this;
      calls.seenAssemblyRequest = assemblyRequest;
      return result as never;
    },
  };
}

async function prepare(
  input: Partial<LoopRuntimePreparedPublicRequestEntryInput> = {},
): Promise<LoopRuntimePreparedPublicRequestEntryResult> {
  return prepareAuthorizedLoopRuntimeRequest({
    principal: principal(),
    payload: payload(),
    authorizer: authorizer({ authorized: true }),
    assembler: assembler({
      assembled: true,
      assembly: assembly(),
    }),
    ...input,
  });
}

function assertSuccess(
  result: LoopRuntimePreparedPublicRequestEntryResult,
): asserts result is Extract<
  LoopRuntimePreparedPublicRequestEntryResult,
  { prepared: true }
> {
  assert.equal(result.prepared, true);
  assert.deepEqual(Object.keys(result), ["prepared", "request"]);
  assert.equal(result.request.runtimeId, "local-process");
  assert.equal(result.request.policyId, "policy-id");
  assert.equal(result.request.profileId, "profile-id");
  assert.equal(result.request.command.executable, "node");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.request), true);
}

function assertFailure(
  result: LoopRuntimePreparedPublicRequestEntryResult,
  stage: string,
  reason: string,
): void {
  assert.deepEqual(result, {
    prepared: false,
    stage,
    reason,
  });
  assert.deepEqual(Object.keys(result), ["prepared", "stage", "reason"]);
  assert.equal(Object.isFrozen(result), true);
}

function assertNoForbiddenFields(value: unknown): void {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    "catalog",
    "limits",
    "binding",
    "policyId",
    "profileId",
    "runtimeId",
    "executable",
    "arguments",
    "cwd",
    "principalId",
    "authorizationRequest",
    "assemblyRequest",
    "exception",
    "message",
    "stack",
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} absent`);
  }
}

describe("prepareAuthorizedLoopRuntimeRequest", () => {
  it("prepares complete authorized requests with sync and async ports", async () => {
    assertSuccess(await prepare());
    assertSuccess(
      await prepare({
        authorizer: {
          async authorize() {
            return { authorized: true };
          },
        },
        assembler: {
          async assemble() {
            return {
              assembled: true,
              assembly: assembly(),
            };
          },
        },
      }),
    );
    assertSuccess(
      await prepare({
        authorizer: authorizer({ authorized: true }),
        assembler: {
          async assemble() {
            return {
              assembled: true,
              assembly: assembly(),
            };
          },
        },
      }),
    );
  });

  it("projects decoding and authorization failures without assembly or preparation", async () => {
    const decodeCalls = counters();
    assertFailure(
      await prepare({
        payload: null,
        authorizer: authorizer({ authorized: true }, decodeCalls),
        assembler: assembler({ assembled: true, assembly: assembly() }, decodeCalls),
      }),
      "decoding",
      "invalid_request_object",
    );
    assert.equal(decodeCalls.authorizer, 0);
    assert.equal(decodeCalls.assembler, 0);

    const deniedCalls = counters();
    assertFailure(
      await prepare({
        authorizer: authorizer(
          { authorized: false, reason: "not_authorized" },
          deniedCalls,
        ),
        assembler: assembler({ assembled: true, assembly: assembly() }, deniedCalls),
      }),
      "authorization",
      "not_authorized",
    );
    assert.equal(deniedCalls.authorizer, 1);
    assert.equal(deniedCalls.assembler, 0);
  });

  it("maps invalid principal, invalid authorizer, and malformed authorization decisions to authorization failure", async () => {
    assertFailure(
      await prepare({
        principal: { principalId: "" },
      }),
      "authorization",
      "not_authorized",
    );
    assertFailure(
      await prepare({
        authorizer: null as never,
      }),
      "authorization",
      "not_authorized",
    );
    assertFailure(
      await prepare({
        authorizer: authorizer({ authorized: "true" }),
      }),
      "authorization",
      "not_authorized",
    );
  });

  it("projects assembly failures and never prepares after them", async () => {
    assertFailure(
      await prepare({
        assembler: null as never,
      }),
      "assembly",
      "invalid_assembly",
    );
    assertFailure(
      await prepare({
        assembler: assembler({
          assembled: false,
          reason: "assembly_unavailable",
        }),
      }),
      "assembly",
      "assembly_unavailable",
    );
    assertFailure(
      await prepare({
        assembler: assembler({
          assembled: false,
          reason: "assembly_ambiguous",
        }),
      }),
      "assembly",
      "assembly_ambiguous",
    );
    assertFailure(
      await prepare({
        assembler: assembler({ assembled: true, assembly: { catalog: {} } }),
      }),
      "assembly",
      "invalid_assembly",
    );
    assertFailure(
      await prepare({
        assembler: {
          assemble() {
            throw new Error("hidden");
          },
        },
      }),
      "assembly",
      "invalid_assembly",
    );
    assertFailure(
      await prepare({
        assembler: {
          async assemble() {
            throw new Error("hidden");
          },
        },
      }),
      "assembly",
      "invalid_assembly",
    );
  });

  it("projects preparation failures by reason without leaking internal assembly data", async () => {
    assertFailure(
      await prepare({
        assembler: assembler({
          assembled: true,
          assembly: assembly({
            catalog: {
              policies: [],
              profiles: [],
            },
          }),
        }),
      }),
      "preparation",
      "unknown_policy_ref",
    );
    assertFailure(
      await prepare({
        assembler: assembler({
          assembled: true,
          assembly: assembly({
            limits: {
              maxEffort: "unknown" as never,
              budget: assembly().limits.budget,
            },
          }),
        }),
      }),
      "preparation",
      "invalid_internal_limits",
    );
    assertFailure(
      await prepare({
        assembler: assembler({
          assembled: true,
          assembly: assembly({
            catalog: {
              policies: [
                {
                  ref: "policy.ref",
                  value: {
                    policyRef: "policy.ref",
                    policyId: "",
                  },
                },
              ],
              profiles: assembly().catalog.profiles,
            },
          }),
        }),
      }),
      "preparation",
      "invalid_limited_configuration",
    );
    assertFailure(
      await prepare({
        payload: payload({ mode: "dry-run" }),
      }),
      "preparation",
      "unsupported_dry_run",
    );
    assertFailure(
      await prepare({
        assembler: assembler({
          assembled: true,
          assembly: assembly({
            binding: {
              runtimeId: "local-process",
              executable: "",
              arguments: [],
            },
          }),
        }),
      }),
      "preparation",
      "invalid_binding",
    );

    const failure = await prepare({
      assembler: assembler({
        assembled: true,
        assembly: assembly({
          catalog: {
            policies: [],
            profiles: [],
          },
        }),
      }),
    });
    assertNoForbiddenFields(failure);
  });

  it("preserves call counts, this, and the canonical public request identity sent to assembly", async () => {
    const calls = counters();
    const input = {
      principal: principal(),
      payload: payload(),
      authorizer: authorizer({ authorized: true }, calls),
      assembler: assembler({ assembled: true, assembly: assembly() }, calls),
    };
    const result = await prepare(input);

    assertSuccess(result);
    assert.equal(calls.authorizer, 1);
    assert.equal(calls.assembler, 1);
    assert.equal(calls.thisValue, input.assembler);
    assert.equal(
      (calls.seenAssemblyRequest as { request: unknown }).request ===
        input.payload,
      false,
    );
    assert.equal(
      (calls.seenAssemblyRequest as { request: { project: string } }).request
        .project,
      "loop-engine",
    );
  });

  it("accepts frozen inputs without mutation and remains deterministic", async () => {
    const input = Object.freeze({
      principal: Object.freeze(principal("principal.frozen")),
      payload: Object.freeze({
        ...payload(),
        budget: Object.freeze(payload().budget as Record<string, unknown>),
      }),
      authorizer: Object.freeze(authorizer({ authorized: true })),
      assembler: Object.freeze(
        assembler({
          assembled: true,
          assembly: assembly(),
        }),
      ),
    });
    const before = JSON.stringify({
      principal: input.principal,
      payload: input.payload,
    });
    const first = await prepare(input);
    const second = await prepare(input);

    assert.deepEqual(first, second);
    assert.equal(
      JSON.stringify({
        principal: input.principal,
        payload: input.payload,
      }),
      before,
    );
  });

  it("keeps exact result surfaces", async () => {
    const success = await prepare();
    assertSuccess(success);
    assert.deepEqual(Object.keys(success), ["prepared", "request"]);

    const failure = await prepare({ payload: null });
    assertFailure(failure, "decoding", "invalid_request_object");
  });

  it("contains only composition and no direct decode, authorization, assembler invocation, execution, transport, or Agent coupling", () => {
    const source = readFileSync(
      new URL(
        "../../src/core/loop-runtime-public-request-prepared-entry.ts",
        import.meta.url,
      ),
      "utf8",
    );

    assert.equal(source.includes("decodeLoopRuntimePublicRequest("), false);
    assert.equal(source.includes("authorizeLoopRuntimePublicRequest("), false);
    assert.equal(source.includes(".assemble("), false);
    assert.equal(
      source.includes("resolveLoopRuntimePublicRequestReferences("),
      false,
    );

    for (const forbidden of [
      "runtime-execution-bridge",
      "../runtime/",
      "../agents/",
      "../transports/",
      "node:child_process",
      "node:process",
      "process.env",
      "fetch(",
      "Date.",
      "Math.random",
      "executeRuntime",
    ]) {
      assert.equal(source.includes(forbidden), false, `${forbidden} absent`);
    }
  });
});
