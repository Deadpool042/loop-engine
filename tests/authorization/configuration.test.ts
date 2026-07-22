import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createAuthorizationConfiguration,
  createExecutableMappingRequest,
  createProviderExecutionPlan,
  createProviderRequest,
  createTransportIntent,
  evaluateAuthorization,
  resolveAuthorizationConfiguration,
  summarizeAuthorizationConfiguration,
  validateAuthorizationConfiguration,
  validateExecutableMapping,
  validateTransportIntent,
} from "../../src/core/index.js";
import {
  createAuthorizationConfigurationRegistry,
  OpenClawAuthorizationConfiguration,
  selectAuthorizationConfiguration,
  validateAuthorizationConfiguration as validateWithRegistry,
  type AuthorizationConfiguration,
} from "../../src/authorization/index.js";
import {
  DEFAULT_DENY_POLICY,
  type PolicyRule,
} from "../../src/policy/index.js";
import {
  createOpenClawProtocolPlan,
  normalizeOpenClawRequest,
} from "../../src/providers/openclaw/index.js";
import { OpenClawExecutableMapping } from "../../src/providers/mapping/index.js";
import { OpenClawTransportIntent } from "../../src/providers/intent/index.js";
import type { RuntimeRequest } from "../../src/runtime/index.js";

function runtimeRequest(): RuntimeRequest {
  const profile = {
    id: "authorization.fixture",
    runtime: "openclaw" as const,
    provider: "local" as const,
    model: "fixture",
    effort: "low" as const,
    capabilities: [],
    permissions: ["read_only" as const],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: 0,
      maxRepairs: 0,
    },
  };
  return {
    task: {
      path: "docs/roadmap/authorization.md",
      line: 1,
      text: "- [ ] Authorization",
      kind: "safe",
      reason: "fixture",
      status: "todo",
      priority: "default",
    },
    mode: "plan",
    contextPackage: {
      project: "fixture",
      budget: {
        maxFiles: 1,
        maxCharacters: 100,
        maxEstimatedTokens: 25,
        includeFullFiles: false,
      },
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    },
    resolvedAgentPolicy: {
      policyId: "fixture",
      mode: "plan",
      status: "resolved",
      requirements: {
        category: "none",
        mode: "plan",
        requiredCapabilities: [],
        requiredPermissions: ["read_only"],
        minimumEffort: "low",
        maximumEffort: "low",
        contextBudget: {
          maxFiles: 1,
          maxCharacters: 100,
          maxEstimatedTokens: 25,
          includeFullFiles: false,
        },
        executionBudget: {
          maxTokens: null,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: 0,
          maxRepairs: 0,
        },
        rationale: ["fixture"],
      },
      selectionRequest: {
        requiredCapabilities: [],
        requiredPermissions: ["read_only"],
      },
      selection: { outcome: "selected", profile, rejected: [] },
      reasons: ["fixture"],
    },
    provider: "local",
    effort: "low",
    requestedAt: "2026-01-01T00:00:00.000Z",
    metadata: { requestId: "authorization-fixture" },
    requestedRuntime: "openclaw",
    allowedProviders: ["local"],
    allowedRuntimes: ["openclaw"],
  };
}

function approvingPolicy(): PolicyRule {
  return Object.freeze({
    ...DEFAULT_DENY_POLICY,
    id: "fixture-allow",
    enabled: true,
    allowedProviders: ["openclaw"],
    allowedRuntimes: ["openclaw"],
    allowedMappings: ["openclaw-planning"],
    allowedIntents: ["openclaw-plan"],
    allowedTransports: ["local-process"],
    supportedProtocolVersions: ["loop-engine-openclaw-planning/v1"],
    supportedMappingVersions: ["loop-engine-openclaw-planning/v1"],
    capabilitySet: { capabilities: [], permissions: ["read_only"] },
  });
}

function authorizationDecision() {
  const providerRequest = createProviderRequest(runtimeRequest(), {
    requestedProvider: "openclaw",
  });
  const providerPlan = createProviderExecutionPlan(providerRequest);
  const protocolPlan = createOpenClawProtocolPlan(
    normalizeOpenClawRequest(providerRequest),
  );
  const mappingResult = validateExecutableMapping(
    createExecutableMappingRequest(providerPlan, {
      protocolPlan,
      policy: { enabled: true, allowedMappingIds: ["openclaw-planning"] },
    }),
  );
  const intentResult = validateTransportIntent(
    createTransportIntent(providerPlan, mappingResult),
  );
  return evaluateAuthorization({
    providerPlan,
    mappingResult,
    intentResult,
    protocolPlan,
    policy: approvingPolicy(),
    metadata: { fixture: true },
    mapping: { ...OpenClawExecutableMapping, enabled: true, configured: true },
    intent: { ...OpenClawTransportIntent, active: true, configured: true },
  });
}

const VERSIONS = {
  policyVersion: "default-deny/v1",
  protocolVersion: "loop-engine-openclaw-planning/v1",
  mappingVersion: "loop-engine-openclaw-planning/v1",
  runtimeVersion: "openclaw/v1",
  transportVersion: "local-process/v1",
} as const;

function activeConfiguration(
  overrides: Partial<AuthorizationConfiguration> = {},
): AuthorizationConfiguration {
  return Object.freeze({
    ...OpenClawAuthorizationConfiguration,
    active: true,
    approved: true,
    reviewRequired: false,
    configured: true,
    ...overrides,
  });
}

describe("authorization configuration contracts", () => {
  it("registers one immutable inactive, unapproved, review-required OpenClaw configuration", () => {
    assert.equal(Object.isFrozen(OpenClawAuthorizationConfiguration), true);
    assert.deepEqual(
      OpenClawAuthorizationConfiguration.requirement.transportId,
      "local-process",
    );
    assert.deepEqual(
      [
        OpenClawAuthorizationConfiguration.active,
        OpenClawAuthorizationConfiguration.approved,
        OpenClawAuthorizationConfiguration.reviewRequired,
        OpenClawAuthorizationConfiguration.configured,
      ],
      [false, false, true, false],
    );
    assert.deepEqual(OpenClawAuthorizationConfiguration.reviewMetadata, {
      status: "required",
    });
    assert.doesNotMatch(
      JSON.stringify(OpenClawAuthorizationConfiguration),
      /command|args|binary|path|environment|credential/i,
    );
  });

  it("keeps registry creation deterministic and rejects duplicate ids", () => {
    assert.throws(() =>
      createAuthorizationConfigurationRegistry([
        OpenClawAuthorizationConfiguration,
        OpenClawAuthorizationConfiguration,
      ]),
    );
  });

  it("defaults configuration requests to deny and preserves review state", () => {
    const request = createAuthorizationConfiguration(authorizationDecision(), {
      versions: VERSIONS,
    });
    const selected = selectAuthorizationConfiguration(request);
    assert.equal(selected.outcome, "selected");
    assert.equal(
      resolveAuthorizationConfiguration(request).outcome,
      "rejected",
    );
    const result = validateAuthorizationConfiguration(request);
    assert.equal(result.status, "configuration_inactive");
    assert.equal(result.executionStarted, false);
    assert.equal(result.summary.reviewRequired, true);
  });

  it("keeps OpenClaw configuration blocked when its decision is not authorized", () => {
    const decision = authorizationDecision();
    const request = createAuthorizationConfiguration(
      { ...decision, status: "not_authorized", reason: "mapping_disabled" },
      { versions: VERSIONS },
    );
    assert.equal(
      validateAuthorizationConfiguration(request).status,
      "configuration_not_authorized",
    );
  });

  it("distinguishes configuration policy, approval, and review gates", () => {
    const decision = authorizationDecision();
    const base = createAuthorizationConfiguration(decision, {
      versions: VERSIONS,
      policy: {
        enabled: true,
        allowedConfigurationIds: ["openclaw-plan-review"],
      },
    });
    const registry = createAuthorizationConfigurationRegistry([
      activeConfiguration(),
    ]);
    const denied = validateWithRegistry(
      { ...base, policy: { enabled: false, allowedConfigurationIds: [] } },
      registry,
    );
    const unapproved = validateWithRegistry(
      base,
      createAuthorizationConfigurationRegistry([
        activeConfiguration({ approved: false }),
      ]),
    );
    const review = validateWithRegistry(
      base,
      createAuthorizationConfigurationRegistry([
        activeConfiguration({ reviewRequired: true }),
      ]),
    );
    assert.deepEqual(
      [denied.status, unapproved.status, review.status],
      [
        "configuration_policy_denied",
        "configuration_unapproved",
        "configuration_review_required",
      ],
    );
    assert.ok(
      [denied, unapproved, review].every(
        (result) => result.executionStarted === false,
      ),
    );
  });

  it("leaves Claude and Codex without a matching configuration", () => {
    const decision = authorizationDecision();
    for (const providerId of ["claude-code", "codex"] as const) {
      const request = createAuthorizationConfiguration(
        {
          ...decision,
          evaluation: {
            ...decision.evaluation,
            providerPlan: { ...decision.evaluation.providerPlan, providerId },
          },
        },
        { versions: VERSIONS, requestedConfiguration: "openclaw-plan-review" },
      );
      assert.equal(
        validateAuthorizationConfiguration(request).status,
        "configuration_version_mismatch",
      );
    }
  });

  it("summarizes compatible configuration without creating an executable boundary", () => {
    const request = createAuthorizationConfiguration(authorizationDecision(), {
      versions: VERSIONS,
    });
    const summary = summarizeAuthorizationConfiguration(
      OpenClawAuthorizationConfiguration,
      request,
    );
    assert.equal(summary.versionsCompatible, true);
    assert.equal(summary.active, false);
  });
});

describe("authorization configuration architecture invariants", () => {
  const files = [
    "src/authorization/types.ts",
    "src/authorization/errors.ts",
    "src/authorization/registry.ts",
    "src/authorization/selector.ts",
    "src/authorization/validation.ts",
    "src/authorization/configuration.ts",
    "src/authorization/support.ts",
    "src/authorization/index.ts",
  ];
  for (const file of files) {
    it(`${file} has no execution or request surface`, () => {
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
        /\bcommand\s*:|\bargs\s*:|executablePath|binaryPath|workingDirectory|processOptions/,
      );
      assert.doesNotMatch(
        source,
        /TransportRequest|RuntimeRequest|createTransportRequest|resolveTransport\s*\(|executeTransport\s*\(/,
      );
      assert.doesNotMatch(source, /from\s+["'].*\/(core|cli|commands|loop)\//);
      assert.doesNotMatch(
        source,
        /from\s+["'].*\/(runtime|transports)\/(local-process|registry|selector)/,
      );
    });
  }
});
