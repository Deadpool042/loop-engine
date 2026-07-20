import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  createRuntimeRequest,
  evaluateRuntimeRequest,
  summarizeRuntimeRequest,
  validateRuntimeRequest,
} from "../../src/core/runtime-request.js";

const input = {
  id: "runtime-request",
  version: "v1",
  createdAt: "2026-07-19T00:00:00.000Z",
  bridge: {
    id: "execution-bridge",
    version: "v1",
    ready: true,
    executionAllowed: false as const,
    executionStarted: false as const,
  },
  evidenceReferences: ["evidence-b", "evidence-a"],
};

test("Runtime Request is immutable, serializable, and default denied", () => {
  const request = createRuntimeRequest(input);
  const result = evaluateRuntimeRequest(input);

  assert.deepEqual(request.evidenceReferences, ["evidence-a", "evidence-b"]);
  assert.equal("capabilityRequirements" in request, false);
  assert.equal(result.requestConstructible, true);
  assert.equal(result.executionAllowed, false);
  assert.equal(result.executionStarted, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.input.evidenceReferences), true);
  assert.equal(JSON.parse(JSON.stringify(result)).executionAllowed, false);
  assert.deepEqual(summarizeRuntimeRequest(result), {
    requestConstructible: true,
    executionAllowed: false,
    executionStarted: false,
  });
});

test("Runtime Request rejects absent and invalid Execution Bridge evidence deterministically", () => {
  assert.equal(evaluateRuntimeRequest(null).requestConstructible, false);
  assert.equal(
    evaluateRuntimeRequest({ ...input, bridge: { ...input.bridge, id: "" } })
      .diagnostics[0]?.code,
    "runtime_request_bridge_missing",
  );
  assert.deepEqual(
    validateRuntimeRequest({
      ...input,
      bridge: { ...input.bridge, ready: false },
    }),
    [
      {
        code: "runtime_request_bridge_invalid",
        message: "Execution Bridge reference is invalid.",
        executionAllowed: false,
        executionStarted: false,
      },
    ],
  );
  assert.equal(
    evaluateRuntimeRequest({ ...input, createdAt: "" }).diagnostics[0]?.code,
    "runtime_request_invalid",
  );
});

test("Runtime Request RFC preserves the declarative operational boundary", () => {
  const rfc = readFileSync("docs/architecture/runtime-request-rfc.md", "utf8");
  assert.match(rfc, /not runtime execution/);
  assert.match(rfc, /not a runtime adapter/);
  assert.match(rfc, /executionAllowed` remains false/);
  assert.match(rfc, /executionStarted` remains false/);
});
