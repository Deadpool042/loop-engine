import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createDeclarativeTransportRequestResult,
  createOpenClawTransportRequestFixture,
  validateDeclarativeTransportRequest,
} from "../../src/core/index.js";
import {
  createTransportRequestError,
  createTransportRequestResult,
  OpenClawTransportRequestFixture,
  summarizeTransportRequest,
  validateTransportRequest,
  type TransportRequest,
} from "../../src/transport-request/index.js";

function fixture(overrides: Partial<TransportRequest> = {}): TransportRequest {
  return Object.freeze({
    ...OpenClawTransportRequestFixture,
    ...overrides,
  });
}

describe("transport request contracts", () => {
  it("exposes one immutable OpenClaw request fixture with references only", () => {
    const request = createOpenClawTransportRequestFixture();
    assert.equal(request, OpenClawTransportRequestFixture);
    assert.equal(Object.isFrozen(request), true);
    assert.equal(Object.isFrozen(request.mapping), true);
    assert.equal(Object.isFrozen(request.authorization), true);
    assert.equal(Object.isFrozen(request.runtime), true);
    assert.equal(Object.isFrozen(request.transport), true);
    assert.equal(Object.isFrozen(request.capabilities), true);
    assert.equal(request.status, "validation_required");
    assert.equal(request.active, false);
    assert.equal(request.dispatchable, false);
    assert.equal(request.executable, false);
    assert.equal(request.validationRequired, true);
    assert.deepEqual(
      {
        providerId: request.providerId,
        mappingId: request.mapping.mappingId,
        configurationId: request.authorization.configurationId,
        runtimeId: request.runtime.runtimeId,
        transportId: request.transport.transportId,
      },
      {
        providerId: "openclaw",
        mappingId: "openclaw-planning",
        configurationId: "openclaw-plan-review",
        runtimeId: "openclaw",
        transportId: "local-process",
      },
    );
    assert.doesNotMatch(
      JSON.stringify(request),
      /command|args|argv|binary|workingDirectory|stdin|stdout|stderr|timeout|environment|credential/i,
    );
  });

  it("validates declarative references in a deterministic default-deny order", () => {
    const missingAuthorization = validateTransportRequest(
      fixture({
        authorization: {
          ...OpenClawTransportRequestFixture.authorization,
          configurationId: "",
        },
      }),
    );
    const missingProvider = validateTransportRequest(
      fixture({ providerId: "" as never }),
    );
    const missingMapping = validateTransportRequest(
      fixture({ mapping: { mappingId: "" as never } }),
    );
    const missingRuntime = validateTransportRequest(
      fixture({ runtime: { runtimeId: "" as never } }),
    );
    const missingTransport = validateTransportRequest(
      fixture({ transport: { transportId: "" as never } }),
    );
    const missingCapability = validateTransportRequest(
      fixture({ capabilities: [] }),
    );
    assert.deepEqual(
      [
        missingAuthorization,
        missingProvider,
        missingMapping,
        missingRuntime,
        missingTransport,
        missingCapability,
      ].map((result) => result.error.code),
      [
        "transport_request_authorization_missing",
        "transport_request_provider_missing",
        "transport_request_mapping_missing",
        "transport_request_runtime_missing",
        "transport_request_transport_missing",
        "transport_request_capability_missing",
      ],
    );
    assert.ok(
      [
        missingAuthorization,
        missingProvider,
        missingMapping,
        missingRuntime,
        missingTransport,
        missingCapability,
      ].every((result) => result.executionStarted === false),
    );
  });

  it("keeps even complete references inactive and not authorized by default", () => {
    const result = validateDeclarativeTransportRequest(
      OpenClawTransportRequestFixture,
    );
    assert.equal(result.status, "inactive");
    assert.equal(result.error.code, "transport_request_not_authorized");
    assert.equal(result.summary.active, false);
    assert.equal(result.summary.dispatchable, false);
    assert.equal(result.summary.executable, false);
    assert.equal(result.executionStarted, false);
    assert.equal(result.validation.valid, false);
  });

  it("summarizes and returns declarative results without creating execution work", () => {
    const request = fixture({
      authorization: {
        ...OpenClawTransportRequestFixture.authorization,
        authorized: true,
      },
    });
    const summary = summarizeTransportRequest(request);
    const direct = validateTransportRequest(request);
    const coreResult = createDeclarativeTransportRequestResult(request);
    const custom = createTransportRequestResult(
      request,
      "not_dispatchable",
      createTransportRequestError(
        "transport_request_not_dispatchable",
        "Fixture is not dispatchable.",
      ),
      summary,
    );
    assert.equal(summary.authorized, true);
    assert.equal(direct.error.code, "transport_request_not_dispatchable");
    assert.equal(coreResult.error.code, "transport_request_not_dispatchable");
    assert.equal(custom.executionStarted, false);
  });
});

describe("transport request architecture invariants", () => {
  const transportRequestFiles = [
    "src/transport-request/types.ts",
    "src/transport-request/errors.ts",
    "src/transport-request/validation.ts",
    "src/transport-request/support.ts",
    "src/transport-request/index.ts",
    "src/core/transport-request.ts",
  ];

  for (const file of transportRequestFiles) {
    it(`${file} has no process, command, runtime execution, or transport execution`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(
        source,
        /child_process|\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|\bfork\s*\(/,
      );
      assert.doesNotMatch(
        source,
        /\bfetch\s*\(|node:(http|https|net|tls)|process\.env/,
      );
      assert.doesNotMatch(
        source,
        /\bcommand\s*:|\bargs\s*:|\bargv\s*:|\bbinary(Path)?\s*:|workingDirectory|stdin\s*:|stdout\s*:|stderr\s*:|timeoutMs|environment\s*:|credentials?\s*:/,
      );
      assert.doesNotMatch(
        source,
        /LocalProcessRuntime|RuntimeAdapter|RuntimeRequest|executeRuntime|executeTransport|selectTransport|resolveTransport\s*\(/,
      );
      assert.doesNotMatch(
        source,
        /from\s+["'].*\/transports\/(local-process|registry|selector)/,
      );
      assert.doesNotMatch(source, /from\s+["'].*\/(cli|commands|loop)\//);
    });
  }

  it("TransportAdapter remains disconnected from the declarative TransportRequest module", () => {
    const source = readFileSync("src/transports/types.ts", "utf8");
    assert.doesNotMatch(source, /transport-request/);
    assert.doesNotMatch(source, /\bTransportRequest\b/);
    assert.match(source, /\bTransportAdapterRequest\b/);
  });
});
