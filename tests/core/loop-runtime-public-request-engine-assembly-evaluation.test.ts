import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  evaluateLoopRuntimeAuthorizedEngineAssembler,
  type LoopRuntimeAuthorizedEngineAssembler,
  type LoopRuntimeAuthorizedEngineAssembly,
  type LoopRuntimeAuthorizedEngineAssemblyRequest,
  type LoopRuntimeAuthorizedEngineAssemblyResult,
} from "../../src/core/index.js";

function publicRequest(mode: "execute" | "dry-run" = "execute") {
  return Object.freeze({
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: "loop-engine",
    mode,
    policyRef: "policy.ref",
    profileRef: "profile.ref",
    requestedMaxEffort: "medium" as const,
    budget: Object.freeze({
      maxTokens: 10,
      maxCostUsd: 1,
      maxDurationMs: 1_000,
      maxCalls: 1,
      maxRepairs: 0,
    }),
  });
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

function assemblyRequest(
  overrides: Partial<LoopRuntimeAuthorizedEngineAssemblyRequest> = {},
): LoopRuntimeAuthorizedEngineAssemblyRequest {
  return Object.freeze({
    principalId: "principal",
    request: publicRequest(),
    ...overrides,
  });
}

async function evaluate(
  assembler: unknown,
  request: LoopRuntimeAuthorizedEngineAssemblyRequest = assemblyRequest(),
): Promise<LoopRuntimeAuthorizedEngineAssemblyResult> {
  return evaluateLoopRuntimeAuthorizedEngineAssembler(
    request,
    assembler as LoopRuntimeAuthorizedEngineAssembler,
  );
}

function assertInvalid(result: LoopRuntimeAuthorizedEngineAssemblyResult): void {
  assert.deepEqual(result, {
    assembled: false,
    reason: "invalid_assembly",
  });
  assert.equal(Object.isFrozen(result), true);
}

function assertFailure(
  result: LoopRuntimeAuthorizedEngineAssemblyResult,
  reason: "assembly_unavailable" | "assembly_ambiguous" | "invalid_assembly",
): void {
  assert.deepEqual(result, {
    assembled: false,
    reason,
  });
  assert.equal(Object.isFrozen(result), true);
}

function assertSuccess(result: LoopRuntimeAuthorizedEngineAssemblyResult): void {
  assert.equal(result.assembled, true);
  if (result.assembled) {
    assert.deepEqual(Object.keys(result), ["assembled", "assembly"]);
    assert.deepEqual(Object.keys(result.assembly), [
      "catalog",
      "limits",
      "binding",
    ]);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.assembly), true);
  }
}

describe("evaluateLoopRuntimeAuthorizedEngineAssembler", () => {
  it("accepts synchronous and asynchronous successful assemblers", async () => {
    assertSuccess(
      await evaluate({
        assemble() {
          return {
            assembled: true,
            assembly: assembly(),
          };
        },
      }),
    );
    assertSuccess(
      await evaluate({
        async assemble() {
          return {
            assembled: true,
            assembly: assembly(),
          };
        },
      }),
    );
  });

  it("canonicalizes explicit assembly failure reasons", async () => {
    assertFailure(
      await evaluate({
        assemble() {
          return {
            assembled: false,
            reason: "assembly_unavailable",
          };
        },
      }),
      "assembly_unavailable",
    );
    assertFailure(
      await evaluate({
        async assemble() {
          return {
            assembled: false,
            reason: "assembly_ambiguous",
          };
        },
      }),
      "assembly_ambiguous",
    );
    assertFailure(
      await evaluate({
        assemble() {
          return {
            assembled: false,
            reason: "invalid_assembly",
          };
        },
      }),
      "invalid_assembly",
    );
  });

  it("rejects invalid requests without invoking the assembler", async () => {
    let calls = 0;
    const assembler = {
      assemble() {
        calls += 1;
        return {
          assembled: true,
          assembly: assembly(),
        };
      },
    };

    assertInvalid(await evaluate(assembler, null as never));
    assertInvalid(await evaluate(assembler, [] as never));
    assertInvalid(await evaluate(assembler, {
      principalId: "",
      request: publicRequest(),
    }));
    assertInvalid(await evaluate(assembler, {
      principalId: "principal",
      request: {
        ...publicRequest(),
        policyRef: "",
      },
    } as never));
    assertInvalid(await evaluate(assembler, {
      principalId: "principal",
      request: publicRequest(),
      extra: true,
    } as never));
    assert.equal(calls, 0);
  });

  it("rejects invalid and hostile assembler ports without invocation", async () => {
    assertInvalid(await evaluate(null));
    assertInvalid(await evaluate({}));
    assertInvalid(await evaluate({ assemble: "not-a-function" }));

    let getterInvoked = false;
    const getterPort = {};
    Object.defineProperty(getterPort, "assemble", {
      enumerable: true,
      get() {
        getterInvoked = true;
        return () => ({ assembled: true, assembly: assembly() });
      },
    });
    assertInvalid(await evaluate(getterPort));
    assert.equal(getterInvoked, false);

    const proxyPort = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error("proxy must be fail-closed");
        },
      },
    );
    assertInvalid(await evaluate(proxyPort));
  });

  it("maps exceptions, rejections, and hostile thenables to invalid assembly", async () => {
    assertInvalid(
      await evaluate({
        assemble() {
          throw new Error("hidden");
        },
      }),
    );
    assertInvalid(
      await evaluate({
        async assemble() {
          throw new Error("hidden async");
        },
      }),
    );
    assertInvalid(
      await evaluate({
        assemble() {
          return {
            then() {
              throw new Error("hidden thenable");
            },
          };
        },
      }),
    );
  });

  it("rejects malformed result surfaces", async () => {
    for (const malformed of [
      null,
      [],
      { assembled: "true", assembly: assembly() },
      { assembled: true },
      { assembled: true, assembly: assembly(), extra: true },
      { assembled: false },
      { assembled: false, reason: "missing_binding" },
      { assembled: false, reason: "assembly_unavailable", extra: true },
      Object.assign(Object.create({}), {
        assembled: true,
        assembly: assembly(),
      }),
    ]) {
      assertInvalid(
        await evaluate({
          assemble() {
            return malformed;
          },
        }),
      );
    }
  });

  it("rejects incomplete, accessor, symbol, and extra assembly surfaces", async () => {
    const getterAssembly = {};
    Object.defineProperty(getterAssembly, "catalog", {
      enumerable: true,
      get() {
        throw new Error("assembly getter must not run");
      },
    });
    Object.defineProperty(getterAssembly, "limits", {
      enumerable: true,
      value: assembly().limits,
    });
    Object.defineProperty(getterAssembly, "binding", {
      enumerable: true,
      value: assembly().binding,
    });

    const symbol = Symbol("secret");
    for (const malformedAssembly of [
      { catalog: assembly().catalog, limits: assembly().limits },
      { ...assembly(), extra: true },
      { ...assembly(), [symbol]: true },
      getterAssembly,
      Object.assign(Object.create({}), assembly()),
    ]) {
      assertInvalid(
        await evaluate({
          assemble() {
            return {
              assembled: true,
              assembly: malformedAssembly,
            };
          },
        }),
      );
    }
  });

  it("preserves this and invokes the assembler exactly once", async () => {
    const seen: { thisValue: unknown; calls: number } = {
      thisValue: null,
      calls: 0,
    };
    const assembler = {
      assemble(this: unknown) {
        seen.calls += 1;
        seen.thisValue = this;
        return {
          assembled: true,
          assembly: assembly(),
        };
      },
    };

    assertSuccess(await evaluate(assembler));
    assert.equal(seen.calls, 1);
    assert.equal(seen.thisValue, assembler);
  });

  it("does not mutate inputs and remains deterministic", async () => {
    const request = assemblyRequest();
    const assembler = Object.freeze({
      assemble() {
        return {
          assembled: true,
          assembly: assembly(),
        };
      },
    });
    const first = await evaluate(assembler, request);
    const second = await evaluate(assembler, request);

    assert.deepEqual(first, second);
    assert.equal(request.principalId, "principal");
    assert.equal(Object.isFrozen(request), true);
    assert.equal(Object.isFrozen(assembler), true);
  });

  it("contains no retry, fallback, timeout, transport, process, Agent, or Runtime execution coupling", () => {
    const source = readFileSync(
      new URL(
        "../../src/core/loop-runtime-public-request-engine-assembly-evaluation.ts",
        import.meta.url,
      ),
      "utf8",
    );

    for (const forbidden of [
      "retry",
      "fallback",
      "setTimeout",
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
    ]) {
      assert.equal(source.includes(forbidden), false, `${forbidden} absent`);
    }
  });
});
