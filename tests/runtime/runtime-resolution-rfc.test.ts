import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createRuntimeResolution,
  evaluateRuntimeResolution,
  summarizeRuntimeResolution,
  validateRuntimeResolution,
} from "../../src/core/runtime-resolution.js";

const input = {
  id: "runtime-resolution",
  version: "v1",
  resolvedAt: "2026-07-19T00:00:00.000Z",
  request: {
    id: "runtime-request",
    version: "v1",
    constructible: true,
    executionAllowed: false as const,
    executionStarted: false as const,
  },
  descriptorReferences: ["descriptor-b", "descriptor-a"],
};

test("Runtime Resolution is immutable, serializable, deterministic, and default denied", () => {
  const resolution = createRuntimeResolution(input);
  const result = evaluateRuntimeResolution(input);

  assert.deepEqual(resolution.descriptorReferences, ["descriptor-a", "descriptor-b"]);
  assert.equal(result.resolutionEligible, true);
  assert.equal(result.executionAllowed, false);
  assert.equal(result.executionStarted, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.input.descriptorReferences), true);
  assert.deepEqual(evaluateRuntimeResolution(input), result);
  assert.equal(JSON.parse(JSON.stringify(result)).executionStarted, false);
  assert.deepEqual(summarizeRuntimeResolution(result), {
    resolutionEligible: true,
    executionAllowed: false,
    executionStarted: false,
  });
});

test("Runtime Resolution rejects absent and invalid Runtime Request evidence", () => {
  assert.equal(evaluateRuntimeResolution(null).resolutionEligible, false);
  assert.equal(
    evaluateRuntimeResolution({ ...input, request: { ...input.request, id: "" } }).diagnostics[0]?.code,
    "runtime_resolution_request_missing",
  );
  assert.deepEqual(
    validateRuntimeResolution({ ...input, request: { ...input.request, constructible: false } }),
    [
      {
        code: "runtime_resolution_request_invalid",
        message: "Runtime Request reference is invalid.",
        executionAllowed: false,
        executionStarted: false,
      },
    ],
  );
  assert.equal(
    evaluateRuntimeResolution({ ...input, resolvedAt: "" }).diagnostics[0]?.code,
    "runtime_resolution_invalid",
  );
});

test("Runtime Resolution RFC preserves the declarative boundary", () => {
  const rfc = readFileSync("docs/architecture/runtime-resolution-rfc.md", "utf8");
  assert.match(rfc, /not runtime implementation/);
  assert.match(rfc, /not a runtime adapter/);
  assert.match(rfc, /executionAllowed` remains false/);
  assert.match(rfc, /executionStarted` remains false/);
});
