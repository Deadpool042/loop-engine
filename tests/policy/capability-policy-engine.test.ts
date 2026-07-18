import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createExecutableMappingRequest,
  createProviderExecutionPlan,
  createProviderRequest,
  createTransportIntent,
  evaluateAuthorization,
  evaluateCapabilities,
  evaluatePolicies,
  normalizeAuthorization,
  validateExecutableMapping,
  validateTransportIntent,
} from "../../src/core/index.js";
import {
  CAPABILITY_REGISTRY,
  createPolicyRegistry,
  DEFAULT_DENY_POLICY,
  evaluateAuthorization as evaluateWithPolicy,
  getPolicyRule,
  POLICY_REGISTRY,
  type AuthorizationEvaluation,
  type PolicyRule,
} from "../../src/policy/index.js";
import { OpenClawTransportIntent } from "../../src/providers/intent/index.js";
import { OpenClawExecutableMapping } from "../../src/providers/mapping/index.js";
import {
  createOpenClawProtocolPlan,
  normalizeOpenClawRequest,
} from "../../src/providers/openclaw/index.js";
import type { RuntimeRequest } from "../../src/runtime/index.js";

function runtimeRequest(): RuntimeRequest {
  const profile = {
    id: "policy.fixture",
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
      path: "docs/roadmap/policy.md",
      line: 1,
      text: "- [ ] Policy",
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
    metadata: { requestId: "policy-fixture" },
    requestedRuntime: "openclaw",
    allowedProviders: ["local"],
    allowedRuntimes: ["openclaw"],
  };
}

function evaluation(
  overrides: Partial<AuthorizationEvaluation> = {},
): AuthorizationEvaluation {
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
  return {
    providerPlan,
    mappingResult,
    intentResult,
    protocolPlan,
    policy: DEFAULT_DENY_POLICY,
    metadata: { fixture: true },
    mapping: OpenClawExecutableMapping,
    intent: OpenClawTransportIntent,
    ...overrides,
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

describe("capability and policy engine", () => {
  it("keeps capability and policy registries static, immutable, and deterministic", () => {
    assert.equal(Object.isFrozen(CAPABILITY_REGISTRY), true);
    assert.equal(Object.isFrozen(POLICY_REGISTRY), true);
    assert.deepEqual(
      POLICY_REGISTRY.rules.map((rule) => rule.id),
      ["default-deny"],
    );
    assert.equal(getPolicyRule("default-deny"), DEFAULT_DENY_POLICY);
    assert.throws(() =>
      createPolicyRegistry([DEFAULT_DENY_POLICY, DEFAULT_DENY_POLICY]),
    );
  });

  it("evaluates capability and policy default-deny state without authorization", () => {
    const input = evaluation();
    assert.equal(evaluateCapabilities(input).status, "supported");
    assert.equal(evaluatePolicies(input).status, "denied");
    assert.equal(evaluatePolicies(input).reason, "policy_disabled");
  });

  it("keeps OpenClaw not_authorized because its executable mapping is disabled", () => {
    const decision = evaluateAuthorization(evaluation());
    assert.equal(decision.status, "not_authorized");
    assert.equal(decision.reason, "mapping_disabled");
    assert.equal(decision.executionStarted, false);
    assert.equal(decision.summary.policyAllowed, false);
  });

  it("distinguishes Provider, Runtime, mapping, intent, transport, and protocol incompatibilities", () => {
    const base = evaluation({
      mapping: {
        ...OpenClawExecutableMapping,
        enabled: true,
        configured: true,
      },
      intent: { ...OpenClawTransportIntent, active: true, configured: true },
      policy: approvingPolicy(),
    });
    const provider = evaluateWithPolicy({
      ...base,
      providerPlan: { ...base.providerPlan, providerId: "codex" },
    });
    const runtime = evaluateWithPolicy({
      ...base,
      providerPlan: { ...base.providerPlan, runtimeId: "codex" },
    });
    const mapping = evaluateWithPolicy({
      ...base,
      mappingResult: { ...base.mappingResult, mappingId: null },
    });
    const intent = evaluateWithPolicy({
      ...base,
      intentResult: { ...base.intentResult, intentId: null },
    });
    const transport = evaluateWithPolicy({
      ...base,
      policy: { ...approvingPolicy(), allowedTransports: [] },
    });
    const protocol = evaluateWithPolicy({
      ...base,
      protocolPlan: {
        ...base.protocolPlan!,
        validation: { ...base.protocolPlan!.validation, valid: false },
      },
    });
    assert.deepEqual(
      [provider, runtime, mapping, intent, transport, protocol].map(
        (decision) => decision.reason,
      ),
      [
        "provider_mismatch",
        "runtime_mismatch",
        "mapping_mismatch",
        "intent_mismatch",
        "transport_unsupported",
        "protocol_unsupported",
      ],
    );
  });

  it("keeps inactive intents and missing permissions outside authorization", () => {
    const base = evaluation({
      mapping: {
        ...OpenClawExecutableMapping,
        enabled: true,
        configured: true,
      },
      intent: { ...OpenClawTransportIntent, active: true, configured: true },
      policy: approvingPolicy(),
    });
    const inactive = evaluateAuthorization({
      ...base,
      intent: { ...base.intent!, active: false },
    });
    const permission = evaluateAuthorization({
      ...base,
      policy: {
        ...approvingPolicy(),
        capabilitySet: { capabilities: [], permissions: [] },
      },
    });
    assert.deepEqual(
      [inactive.reason, permission.reason],
      ["intent_inactive", "permission_unsupported"],
    );
    assert.equal(inactive.executionStarted, false);
    assert.equal(permission.executionStarted, false);
  });

  it("can report a theoretical authorization without creating an executable boundary", () => {
    const base = evaluation({
      mapping: {
        ...OpenClawExecutableMapping,
        enabled: true,
        configured: true,
      },
      intent: { ...OpenClawTransportIntent, active: true, configured: true },
      policy: approvingPolicy(),
    });
    const decision = evaluateAuthorization(base);
    assert.equal(decision.status, "authorized");
    assert.equal(decision.reason, "theoretical_authorization");
    assert.equal(decision.executionStarted, false);
    assert.deepEqual(normalizeAuthorization(decision), decision);
  });

  it("leaves Claude and Codex without authorization", () => {
    for (const providerId of ["claude-code", "codex"] as const) {
      const decision = evaluateAuthorization(
        evaluation({
          providerPlan: { ...evaluation().providerPlan, providerId },
        }),
      );
      assert.notEqual(decision.status, "authorized");
      assert.equal(decision.executionStarted, false);
    }
  });
});

describe("capability policy architecture invariants", () => {
  const files = [
    "src/policy/types.ts",
    "src/policy/errors.ts",
    "src/policy/registry.ts",
    "src/policy/selector.ts",
    "src/policy/validation.ts",
    "src/policy/evaluation.ts",
    "src/policy/support.ts",
    "src/policy/index.ts",
  ];
  for (const file of files) {
    it(`${file} has no execution or transport request surface`, () => {
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
        /TransportRequest|createTransportRequest|resolveTransport\s*\(|executeTransport\s*\(/,
      );
      assert.doesNotMatch(source, /from\s+["'].*\/(core|cli|commands|loop)\//);
      assert.doesNotMatch(
        source,
        /from\s+["'].*\/transports\/(local-process|registry|selector)/,
      );
    });
  }
});
