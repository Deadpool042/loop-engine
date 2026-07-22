import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  decodeLoopRuntimePublicRequest,
  type LoopRuntimePublicRequest,
  type LoopRuntimePublicRequestDecodeFailureReason,
  type LoopRuntimePublicRequestDecodeResult,
} from "../../src/core/index.js";

const ROOT_REQUIRED_KEYS = [
  "schemaVersion",
  "project",
  "mode",
  "policyRef",
  "profileRef",
  "requestedMaxEffort",
  "budget",
] as const;

const ROOT_FORBIDDEN_KEYS = [
  "runtimeId",
  "policyId",
  "profileId",
  "executable",
  "arguments",
  "cwd",
  "environment",
  "headers",
  "destination",
  "provider",
  "model",
  "capabilities",
  "permissions",
  "failureReason",
  "__proto__",
  "constructor",
] as const;

const BUDGET_REQUIRED_KEYS = [
  "maxTokens",
  "maxCostUsd",
  "maxDurationMs",
  "maxCalls",
  "maxRepairs",
] as const;

function validInput(
  overrides: Partial<Record<keyof LoopRuntimePublicRequest, unknown>> = {},
): Record<string, unknown> {
  return {
    schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
    project: "loop-engine",
    mode: "execute",
    policyRef: "policy.ref",
    profileRef: "profile.ref",
    requestedMaxEffort: "medium",
    budget: {
      maxTokens: 1,
      maxCostUsd: 2,
      maxDurationMs: 3,
      maxCalls: 4,
      maxRepairs: 5,
    },
    ...overrides,
  };
}

function validBudget(
  overrides: Partial<LoopRuntimePublicRequest["budget"]> = {},
): Record<string, unknown> {
  return {
    maxTokens: 1,
    maxCostUsd: 2,
    maxDurationMs: 3,
    maxCalls: 4,
    maxRepairs: 5,
    ...overrides,
  };
}

function expectFailure(
  input: unknown,
  reason: LoopRuntimePublicRequestDecodeFailureReason,
): void {
  const result = decodeLoopRuntimePublicRequest(input);

  assert.deepEqual(result, {
    parsed: false,
    reason,
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal("request" in result, false);
}

function expectSuccess(input: unknown): LoopRuntimePublicRequest {
  const result: LoopRuntimePublicRequestDecodeResult =
    decodeLoopRuntimePublicRequest(input);

  assert.equal(result.parsed, true);
  if (!result.parsed) {
    throw new Error(`expected decoded request, got ${result.reason}`);
  }
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.request), true);
  assert.equal(Object.isFrozen(result.request.budget), true);
  return result.request;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("decodeLoopRuntimePublicRequest", () => {
  it("decodes a valid execute request into a canonical frozen copy", () => {
    const input = validInput();
    const request = expectSuccess(input);

    assert.deepEqual(request, {
      schemaVersion: 1,
      project: "loop-engine",
      mode: "execute",
      policyRef: "policy.ref",
      profileRef: "profile.ref",
      requestedMaxEffort: "medium",
      budget: {
        maxTokens: 1,
        maxCostUsd: 2,
        maxDurationMs: 3,
        maxCalls: 4,
        maxRepairs: 5,
      },
    });
    assert.notEqual(request, input);
    assert.notEqual(request.budget, input.budget);
  });

  it("decodes a structurally valid dry-run request", () => {
    const request = expectSuccess(validInput({ mode: "dry-run" }));

    assert.equal(request.mode, "dry-run");
  });

  it("preserves cycleId when present and omits it when absent", () => {
    const withCycle = expectSuccess(validInput({ cycleId: "cycle-001" }));
    const withoutCycle = expectSuccess(validInput());

    assert.equal(withCycle.cycleId, "cycle-001");
    assert.deepEqual(Object.keys(withCycle), [
      "schemaVersion",
      "project",
      "cycleId",
      "mode",
      "policyRef",
      "profileRef",
      "requestedMaxEffort",
      "budget",
    ]);
    assert.equal("cycleId" in withoutCycle, false);
    assert.deepEqual(Object.keys(withoutCycle), [
      "schemaVersion",
      "project",
      "mode",
      "policyRef",
      "profileRef",
      "requestedMaxEffort",
      "budget",
    ]);
  });

  it("rejects invalid root shapes", () => {
    expectFailure(null, "invalid_request_object");
    expectFailure([], "invalid_request_object");
    expectFailure("payload", "invalid_request_object");
    expectFailure(1, "invalid_request_object");
    expectFailure(() => undefined, "invalid_request_object");
    expectFailure(new Date(), "invalid_request_object");
    expectFailure(new Map(), "invalid_request_object");
    expectFailure(new Set(), "invalid_request_object");
    expectFailure(new (class Custom {})(), "invalid_request_object");
    expectFailure(
      Object.assign(Object.create({ inherited: true }), validInput()),
      "invalid_request_object",
    );
    expectFailure(
      Object.assign(Object.create(null), validInput()),
      "invalid_request_object",
    );
  });

  it("rejects missing root fields", () => {
    for (const key of ROOT_REQUIRED_KEYS) {
      const input = validInput();
      delete input[key];

      expectFailure(input, "missing_request_field");
    }
  });

  it("rejects every forbidden root field without echoing the key", () => {
    for (const key of ROOT_FORBIDDEN_KEYS) {
      const input = validInput();
      Object.defineProperty(input, key, {
        value: key,
        enumerable: true,
      });

      expectFailure(input, "unexpected_request_field");
    }
  });

  it("rejects symbolic, accessor, and non-enumerable root properties", () => {
    const withSymbol = validInput();
    Object.defineProperty(withSymbol, Symbol("root"), {
      value: "symbol",
      enumerable: true,
    });
    expectFailure(withSymbol, "unexpected_request_field");

    let getterCalled = false;
    const withGetter = validInput();
    Object.defineProperty(withGetter, "project", {
      enumerable: true,
      get() {
        getterCalled = true;
        throw new Error("root getter executed");
      },
    });
    expectFailure(withGetter, "invalid_request_property");
    assert.equal(getterCalled, false);

    const nonEnumerable = validInput();
    Object.defineProperty(nonEnumerable, "project", {
      value: "loop-engine",
      enumerable: false,
    });
    expectFailure(nonEnumerable, "invalid_request_property");
  });

  it("rejects invalid budget shapes", () => {
    expectFailure(validInput({ budget: null }), "invalid_budget_object");
    expectFailure(validInput({ budget: [] }), "invalid_budget_object");
    expectFailure(
      validInput({
        budget: Object.assign(Object.create({ inherited: true }), validBudget()),
      }),
      "invalid_budget_object",
    );
  });

  it("rejects missing and unexpected budget fields", () => {
    for (const key of BUDGET_REQUIRED_KEYS) {
      const budget = validBudget();
      delete budget[key];
      expectFailure(validInput({ budget }), "missing_budget_field");
    }

    expectFailure(
      validInput({ budget: { ...validBudget(), extra: true } }),
      "unexpected_budget_field",
    );

    const withSymbol = validBudget();
    Object.defineProperty(withSymbol, Symbol("budget"), {
      value: "symbol",
      enumerable: true,
    });
    expectFailure(validInput({ budget: withSymbol }), "unexpected_budget_field");
  });

  it("rejects accessor and non-enumerable budget properties without invoking getters", () => {
    let getterCalled = false;
    const withGetter = validBudget();
    Object.defineProperty(withGetter, "maxTokens", {
      enumerable: true,
      get() {
        getterCalled = true;
        throw new Error("budget getter executed");
      },
    });
    expectFailure(validInput({ budget: withGetter }), "invalid_budget_property");
    assert.equal(getterCalled, false);

    const nonEnumerable = validBudget();
    Object.defineProperty(nonEnumerable, "maxTokens", {
      value: 1,
      enumerable: false,
    });
    expectFailure(
      validInput({ budget: nonEnumerable }),
      "invalid_budget_property",
    );
  });

  it("propagates every V13.49 validation reason", () => {
    const cases: Array<[
      Record<string, unknown>,
      LoopRuntimePublicRequestDecodeFailureReason,
    ]> = [
      [validInput({ schemaVersion: 2 }), "unsupported_schema"],
      [validInput({ project: "   " }), "invalid_project"],
      [validInput({ cycleId: "   " }), "invalid_cycle_id"],
      [validInput({ mode: "plan" }), "invalid_mode"],
      [validInput({ policyRef: "   " }), "invalid_policy_ref"],
      [validInput({ profileRef: "   " }), "invalid_profile_ref"],
      [validInput({ requestedMaxEffort: "extreme" }), "invalid_effort"],
      [
        validInput({ budget: { ...validBudget(), maxCostUsd: Infinity } }),
        "invalid_budget",
      ],
    ];

    for (const [input, reason] of cases) {
      expectFailure(input, reason);
    }
  });

  it("accepts frozen input without mutation", () => {
    const input = Object.freeze({
      ...validInput({ cycleId: "cycle-001" }),
      budget: Object.freeze(validBudget()),
    });
    const before = cloneJson(input);
    const request = expectSuccess(input);

    assert.deepEqual(input, before);
    assert.notEqual(request, input);
    assert.notEqual(request.budget, input.budget);
  });

  it("returns frozen failures and remains deterministic", () => {
    const invalid = validInput({ project: "" });
    const first = decodeLoopRuntimePublicRequest(invalid);
    const second = decodeLoopRuntimePublicRequest(invalid);

    assert.deepEqual(first, second);
    assert.equal(Object.isFrozen(first), true);
  });

  it("converts hostile proxy inspection failures to invalid_input", () => {
    const ownKeysProxy = new Proxy(validInput(), {
      ownKeys() {
        throw new Error("ownKeys trap");
      },
    });
    const prototypeProxy = new Proxy(validInput(), {
      getPrototypeOf() {
        throw new Error("getPrototypeOf trap");
      },
    });
    const descriptorProxy = new Proxy(validInput(), {
      getOwnPropertyDescriptor() {
        throw new Error("descriptor trap");
      },
    });

    expectFailure(ownKeysProxy, "invalid_input");
    expectFailure(prototypeProxy, "invalid_input");
    expectFailure(descriptorProxy, "invalid_input");
  });

  it("does not import resolution, execution, bridge, agent, transport, process, I/O, env, clock, or random APIs", () => {
    const source = readFileSync(
      "src/core/loop-runtime-public-request-decoder.ts",
      "utf8",
    );

    for (const forbidden of [
      "loop-runtime-public-request-resolution",
      "loop-runtime-public-request-preparation",
      "loop-runtime-public-request-runtime-request",
      "runtime-execution-bridge",
      "../runtime/",
      "../agents/",
      "../transports/",
      "node:fs",
      "child_process",
      "process.env",
      "Date.now",
      "new Date",
      "Math.random",
      "crypto.randomUUID",
      "fetch",
      "sender",
      "catalog",
      "binding",
    ]) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
  });
});
