import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildTransportRequest,
  normalizeTransportRequestBuild,
  summarizeTransportRequestBuild,
  validateTransportRequestBuild,
} from "../../src/core/index.js";
import {
  OpenClawAuthorizationConfiguration,
  type AuthorizationConfiguration,
} from "../../src/authorization/index.js";
import type { ProviderExecutionPlan } from "../../src/providers/index.js";

function providerPlan(
  overrides: Partial<ProviderExecutionPlan> = {},
): ProviderExecutionPlan {
  return Object.freeze({
    providerId: "openclaw",
    provider: "local",
    runtimeId: "openclaw",
    status: "not_implemented",
    transport: "not_configured",
    requiredPermissions: Object.freeze(["read_only"]),
    diagnostics: Object.freeze([]),
    metadata: Object.freeze({ requestId: "builder-fixture" }),
    error: Object.freeze({
      code: "provider_not_implemented",
      message: "Fixture plan is inert.",
      details: Object.freeze({}),
      executionStarted: false,
    }),
    ...overrides,
  });
}

function approvedConfiguration(
  overrides: Partial<AuthorizationConfiguration> = {},
): AuthorizationConfiguration {
  return Object.freeze({
    ...OpenClawAuthorizationConfiguration,
    requirement: Object.freeze({
      ...OpenClawAuthorizationConfiguration.requirement,
      approvedTransportCapabilities: Object.freeze(["shell_exec"]),
    }),
    active: true,
    approved: true,
    reviewRequired: false,
    configured: true,
    ...overrides,
  });
}

describe("transport request builder", () => {
  it("builds an immutable default-inactive TransportRequest from references only", () => {
    const result = buildTransportRequest(providerPlan(), approvedConfiguration());
    assert.equal(result.status, "built");
    assert.equal(result.executionStarted, false);
    assert.equal(result.validation.valid, true);
    assert.ok(result.request);
    assert.equal(Object.isFrozen(result.request), true);
    assert.equal(Object.isFrozen(result.request.mapping), true);
    assert.equal(Object.isFrozen(result.request.authorization), true);
    assert.equal(Object.isFrozen(result.request.runtime), true);
    assert.equal(Object.isFrozen(result.request.transport), true);
    assert.equal(Object.isFrozen(result.request.capabilities), true);
    assert.equal(result.request.id, "builder-fixture");
    assert.equal(result.request.providerId, "openclaw");
    assert.equal(result.request.mapping.mappingId, "openclaw-planning");
    assert.equal(result.request.authorization.configurationId, "openclaw-plan-review");
    assert.equal(result.request.runtime.runtimeId, "openclaw");
    assert.equal(result.request.transport.transportId, "local-process");
    assert.deepEqual(
      result.request.capabilities.map((capability) => capability.capabilityId),
      ["shell_exec"],
    );
    assert.equal(result.request.active, false);
    assert.equal(result.request.dispatchable, false);
    assert.equal(result.request.executable, false);
    assert.equal(result.request.validationRequired, true);
    assert.doesNotMatch(
      JSON.stringify(result.request),
      /command|args|argv|binary|workingDirectory|stdin|stdout|stderr|timeout|environment|credential/i,
    );
  });

  it("normalizes and summarizes builder output deterministically", () => {
    const plan = providerPlan();
    const configuration = approvedConfiguration();
    const result = buildTransportRequest(plan, configuration);
    const normalized = normalizeTransportRequestBuild(result);
    const summary = summarizeTransportRequestBuild(plan, configuration, result);
    assert.equal(normalized, result);
    assert.deepEqual(summary, result.summary);
    assert.deepEqual(buildTransportRequest(plan, configuration), result);
  });

  it("rejects invalid plans, authorization, mapping, intent, runtime, transport, and capability references", () => {
    const cases = [
      buildTransportRequest(
        providerPlan({ providerId: "codex" }),
        approvedConfiguration(),
      ),
      buildTransportRequest(providerPlan(), OpenClawAuthorizationConfiguration),
      buildTransportRequest(
        providerPlan(),
        approvedConfiguration({
          requirement: {
            ...OpenClawAuthorizationConfiguration.requirement,
            mappingId: "" as never,
            approvedTransportCapabilities: ["shell_exec"],
          },
        }),
      ),
      buildTransportRequest(
        providerPlan(),
        approvedConfiguration({
          requirement: {
            ...OpenClawAuthorizationConfiguration.requirement,
            intentId: "" as never,
            approvedTransportCapabilities: ["shell_exec"],
          },
        }),
      ),
      buildTransportRequest(
        providerPlan({ runtimeId: "codex" }),
        approvedConfiguration(),
      ),
      buildTransportRequest(
        providerPlan(),
        approvedConfiguration({
          requirement: {
            ...OpenClawAuthorizationConfiguration.requirement,
            transportId: "" as never,
            approvedTransportCapabilities: ["shell_exec"],
          },
        }),
      ),
      buildTransportRequest(
        providerPlan(),
        approvedConfiguration({
          requirement: {
            ...OpenClawAuthorizationConfiguration.requirement,
            approvedTransportCapabilities: [],
          },
        }),
      ),
    ];
    assert.deepEqual(
      cases.map((result) => result.error?.code),
      [
        "builder_invalid_plan",
        "builder_invalid_authorization",
        "builder_invalid_mapping",
        "builder_invalid_intent",
        "builder_invalid_runtime_reference",
        "builder_invalid_transport_reference",
        "builder_invalid_capability_reference",
      ],
    );
    assert.ok(cases.every((result) => result.executionStarted === false));
    assert.ok(cases.every((result) => result.request === null));
  });

  it("exposes validation separately without producing a TransportRequest", () => {
    const validation = validateTransportRequestBuild(
      providerPlan(),
      approvedConfiguration(),
    );
    assert.equal(validation.valid, true);
    assert.equal(validation.diagnostics.length, 0);
  });
});

describe("transport request builder architecture invariants", () => {
  const builderFiles = [
    "src/transport-request/builder.ts",
    "src/transport-request/builder-errors.ts",
    "src/transport-request/builder-validation.ts",
    "src/transport-request/builder-support.ts",
    "src/core/transport-request-builder.ts",
  ];

  for (const file of builderFiles) {
    it(`${file} has no execution, Provider, Runtime, or Transport coupling`, () => {
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
        /TransportAdapterRequest|RuntimeRequest|ProviderAdapter|RuntimeAdapter|TransportAdapter|LocalProcessRuntime|executeTransport|selectTransport|resolveTransport\s*\(/,
      );
      assert.doesNotMatch(
        source,
        /from\s+["'].*\/(runtime|transports|providers)\/(local-process|registry|selector|openclaw|claude-code|codex)/,
      );
      assert.doesNotMatch(source, /from\s+["'].*\/(cli|commands|loop)\//);
    });
  }
});
