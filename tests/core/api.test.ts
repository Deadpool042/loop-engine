import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  createRuntimeExecutionPlan,
  createRuntimeExecutionReceipt,
  createSimulatedRuntimeAdapter,
  createRuntimeCapability,
  createDeclarativeRuntimeRegistry,
  createDeclarativeRuntimeRequest,
  createRuntimeRequest,
  validateLoopRuntimePublicRequest,
  dryRunPolicyAwareDeclarativeRuntimeExecution,
  prepareLoopPolicyBoundLocalProcessExecution,
  evaluateRuntimeCapability,
  evaluateRuntimeExecutionAdmission,
  executeDeclarativeRuntime,
  executePolicyAwareDeclarativeRuntime,
  executePolicyAwareDeclarativeRuntimeWithReceipt,
  executeRuntime,
  generateAuditReport,
  generateAuditRuleManifest,
  generateExecutionReport,
  generateNextProjectActionReport,
  generateProjectContextReport,
  generateProjectHandoffReport,
  generateProjectPromptReport,
  generateReviewReport,
  generateWorkspaceSummaryReport,
  classifyLoopRuntimeExecutionOutcome,
  classifyLoopRuntimeFailure,
  createAgentEscalationRequestFromRuntimeDecision,
  evaluateLoopRuntimeAgentEscalation,
  evaluatePolicyBoundRuntimeExecutionEscalation,
  evaluateRuntimeAgentEscalation,
  evaluateLoopRuntimeEscalation,
  LOOP_RUNTIME_ESCALATION_PUBLIC_SCHEMA_VERSION,
  LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
  loadConfig,
  createLoopRuntimeResolvedRequestConfiguration,
  resolveLoopRuntimePublicRequestReferences,
  executeLoopPolicyBoundLocalProcessWithEscalationEvaluation,
  executeLoopPolicyBoundLocalProcessAndDeliverEscalationProjection,
  type LoopRuntimePublicRequest,
  type LoopRuntimeResolvedPolicyConfiguration,
  type LoopRuntimeResolvedProfileConfiguration,
  type LoopRuntimeResolvedRequestConfiguration,
  type LoopRuntimeResolvedRequestConfigurationResult,
  applyLoopRuntimeInternalLimits,
  type LoopRuntimeInternalLimits,
  type LoopRuntimeLimitedRequestConfiguration,
  type LoopRuntimeRequestLimitResult,
  type LoopRuntimePublicRequestReferenceCatalog,
  type LoopRuntimePublicRequestResolution,
  projectLoopRuntimeEscalationResult,
  deliverLoopRuntimeEscalationProjection,
  serializeLoopRuntimeEscalationProjection,
  executeLoopPolicyBoundLocalProcessWithReceipt,
  resolveRuntime,
  resolveDeclarativeRuntimeExecution,
  resolvePolicyAwareDeclarativeRuntimeExecution,
  runLoopPlan,
  selectRuntimeByCapabilities,
  summarizeRuntimeCapability,
  validateRuntimeCapability,
} from "../../src/core/index.js";

function runJson(command: string): unknown {
  return JSON.parse(
    execSync(command, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as unknown;
}

function loopEngineProject() {
  const project = loadConfig().projects.find(
    ({ name }) => name === "loop-engine",
  );
  assert.ok(project, "loop-engine fixture project must be configured");
  return project;
}

describe("Core public API", () => {
  it("exports reconciled capability APIs without breaking legacy runtime APIs", () => {
    assert.equal(typeof createRuntimeCapability, "function");
    assert.equal(typeof validateRuntimeCapability, "function");
    assert.equal(typeof evaluateRuntimeCapability, "function");
    assert.equal(typeof summarizeRuntimeCapability, "function");
    assert.equal(typeof selectRuntimeByCapabilities, "function");
    assert.equal(typeof createDeclarativeRuntimeRequest, "function");
    assert.equal(typeof createDeclarativeRuntimeRegistry, "function");
    assert.equal(typeof resolveDeclarativeRuntimeExecution, "function");
    assert.equal(typeof executeDeclarativeRuntime, "function");
    assert.equal(typeof evaluateRuntimeExecutionAdmission, "function");
    assert.equal(
      typeof resolvePolicyAwareDeclarativeRuntimeExecution,
      "function",
    );
    assert.equal(typeof executePolicyAwareDeclarativeRuntime, "function");
    assert.equal(typeof executePolicyAwareDeclarativeRuntimeWithReceipt, "function");
    assert.equal(typeof createRuntimeExecutionPlan, "function");
    assert.equal(typeof createRuntimeExecutionReceipt, "function");
    assert.equal(typeof dryRunPolicyAwareDeclarativeRuntimeExecution, "function");
    assert.equal(typeof createSimulatedRuntimeAdapter, "function");
    assert.equal(typeof createRuntimeRequest, "function");
    assert.equal(
      typeof prepareLoopPolicyBoundLocalProcessExecution,
      "function",
    );
    assert.equal(
      typeof executeLoopPolicyBoundLocalProcessWithReceipt,
      "function",
    );
    assert.equal(
      typeof executeLoopPolicyBoundLocalProcessWithEscalationEvaluation,
      "function",
    );
    assert.equal(
      typeof executeLoopPolicyBoundLocalProcessAndDeliverEscalationProjection,
      "function",
    );
    assert.equal(
      typeof projectLoopRuntimeEscalationResult,
      "function",
    );
    assert.equal(
      typeof serializeLoopRuntimeEscalationProjection,
      "function",
    );
    assert.equal(
      typeof deliverLoopRuntimeEscalationProjection,
      "function",
    );
    assert.equal(
      LOOP_RUNTIME_ESCALATION_PUBLIC_SCHEMA_VERSION,
      1,
    );
    assert.equal(
      LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
      1,
    );
    assert.equal(
      typeof classifyLoopRuntimeExecutionOutcome,
      "function",
    );
    assert.equal(typeof classifyLoopRuntimeFailure, "function");
    assert.equal(
      typeof evaluateLoopRuntimeAgentEscalation,
      "function",
    );
    assert.equal(
      typeof evaluatePolicyBoundRuntimeExecutionEscalation,
      "function",
    );
    assert.equal(
      typeof createAgentEscalationRequestFromRuntimeDecision,
      "function",
    );
    assert.equal(
      typeof validateLoopRuntimePublicRequest,
      "function",
    );
    assert.equal(
      typeof resolveLoopRuntimePublicRequestReferences,
      "function",
    );
    assert.equal(
      typeof createLoopRuntimeResolvedRequestConfiguration,
      "function",
    );
    assert.equal(typeof applyLoopRuntimeInternalLimits, "function");
    assert.equal(typeof evaluateRuntimeAgentEscalation, "function");
    assert.equal(typeof evaluateLoopRuntimeEscalation, "function");
    assert.equal(typeof resolveRuntime, "function");
    assert.equal(typeof executeRuntime, "function");
  });

  it("exports the public runtime request contract without internal execution inputs", () => {
    const request: LoopRuntimePublicRequest = {
      schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
      project: "loop-engine",
      mode: "dry-run",
      policyRef: "policy.loop",
      profileRef: "profile.loop",
      requestedMaxEffort: "low",
      budget: {
        maxTokens: 0,
        maxCostUsd: 0,
        maxDurationMs: 0,
        maxCalls: 0,
        maxRepairs: 0,
      },
    };

    assert.equal(validateLoopRuntimePublicRequest(request).valid, true);
  });

  it("exports the public runtime request reference resolution contract", () => {
    const policy = { id: "policy-sentinel" };
    const profile = { id: "profile-sentinel" };
    const request: LoopRuntimePublicRequest = {
      schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
      project: "loop-engine",
      mode: "execute",
      policyRef: "policy.ref",
      profileRef: "profile.ref",
      requestedMaxEffort: "low",
      budget: {
        maxTokens: 0,
        maxCostUsd: 0,
        maxDurationMs: 0,
        maxCalls: 0,
        maxRepairs: 0,
      },
    };
    const catalog: LoopRuntimePublicRequestReferenceCatalog<
      typeof policy,
      typeof profile
    > = {
      policies: [{ ref: "policy.ref", value: policy }],
      profiles: [{ ref: "profile.ref", value: profile }],
    };
    const resolution: LoopRuntimePublicRequestResolution<
      typeof policy,
      typeof profile
    > = resolveLoopRuntimePublicRequestReferences(request, catalog);

    assert.equal(resolution.resolved, true);
  });

  it("exports the resolved public runtime request configuration contract", () => {
    const policy = { policyId: "policy-sentinel" };
    const profile = { profileId: "profile-sentinel", maxEffort: "medium" as const };
    const request: LoopRuntimePublicRequest = {
      schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
      project: "loop-engine",
      mode: "execute",
      policyRef: "policy.ref",
      profileRef: "profile.ref",
      requestedMaxEffort: "low",
      budget: {
        maxTokens: 1,
        maxCostUsd: 2,
        maxDurationMs: 3,
        maxCalls: 4,
        maxRepairs: 5,
      },
    };
    const resolution: LoopRuntimePublicRequestResolution<
      LoopRuntimeResolvedPolicyConfiguration,
      LoopRuntimeResolvedProfileConfiguration
    > = {
      resolved: true,
      request,
      policy: {
        policyRef: request.policyRef,
        policyId: policy.policyId,
      },
      profile: {
        profileRef: request.profileRef,
        profileId: profile.profileId,
        maxEffort: profile.maxEffort,
      },
    };
    const configured: LoopRuntimeResolvedRequestConfigurationResult =
      createLoopRuntimeResolvedRequestConfiguration(resolution);

    assert.equal(configured.configured, true);
    if (configured.configured) {
      assert.equal(configured.configuration.request, request);
      assert.deepEqual(configured.configuration.policy, {
        policyRef: request.policyRef,
        policyId: policy.policyId,
      });
      assert.deepEqual(configured.configuration.profile, {
        profileRef: request.profileRef,
        profileId: profile.profileId,
        maxEffort: profile.maxEffort,
      });
      assert.equal(configured.configuration.effectiveBudget, request.budget);
      assert.equal(Object.isFrozen(configured), true);
      assert.equal(Object.isFrozen(configured.configuration), true);
    }
  });

  it("exports the internal runtime request limits contract", () => {
    const request: LoopRuntimePublicRequest = {
      schemaVersion: LOOP_RUNTIME_PUBLIC_REQUEST_SCHEMA_VERSION,
      project: "loop-engine",
      mode: "execute",
      policyRef: "policy.ref",
      profileRef: "profile.ref",
      requestedMaxEffort: "medium",
      budget: {
        maxTokens: 10,
        maxCostUsd: 20,
        maxDurationMs: 30,
        maxCalls: 40,
        maxRepairs: 50,
      },
    };
    const resolution: LoopRuntimePublicRequestResolution<
      LoopRuntimeResolvedPolicyConfiguration,
      LoopRuntimeResolvedProfileConfiguration
    > = {
      resolved: true,
      request,
      policy: {
        policyRef: request.policyRef,
        policyId: "policy-id",
      },
      profile: {
        profileRef: request.profileRef,
        profileId: "profile-id",
        maxEffort: "high",
      },
    };
    const configuration = createLoopRuntimeResolvedRequestConfiguration(
      resolution,
    );

    assert.equal(typeof applyLoopRuntimeInternalLimits, "function");
    assert.equal(configuration.configured, true);
    if (configuration.configured) {
      const limits: LoopRuntimeInternalLimits = {
        maxEffort: "low",
        budget: {
          maxTokens: 5,
          maxCostUsd: 10,
          maxDurationMs: 15,
          maxCalls: 20,
          maxRepairs: 25,
        },
      };
      const limited: LoopRuntimeRequestLimitResult = applyLoopRuntimeInternalLimits(
        configuration.configuration,
        limits,
      );

      assert.equal(limited.limited, true);
      if (limited.limited) {
        const limitedConfiguration: LoopRuntimeLimitedRequestConfiguration =
          limited.configuration;

        assert.equal(limitedConfiguration.request, request);
        assert.deepEqual(limitedConfiguration.policy, resolution.policy);
        assert.deepEqual(limitedConfiguration.profile, resolution.profile);
        assert.equal(limitedConfiguration.effectiveEffort, "low");
        assert.equal(limitedConfiguration.effectiveBudget.maxTokens, 5);
        assert.equal(limitedConfiguration.effectiveBudget.maxCostUsd, 10);
        assert.equal(limitedConfiguration.effectiveBudget.maxDurationMs, 15);
        assert.equal(limitedConfiguration.effectiveBudget.maxCalls, 20);
        assert.equal(limitedConfiguration.effectiveBudget.maxRepairs, 25);
      }
    }
  });

  it("keeps the stable report payloads identical to their CLI adapters", () => {
    const config = loadConfig();
    const project = loopEngineProject();

    assert.deepEqual(
      runJson("pnpm exec tsx src/cli.ts summary --json"),
      generateWorkspaceSummaryReport(config),
    );
    assert.deepEqual(
      runJson("pnpm exec tsx src/cli.ts context loop-engine --json"),
      generateProjectContextReport(project),
    );
    assert.deepEqual(
      runJson("pnpm exec tsx src/cli.ts handoff loop-engine --json"),
      generateProjectHandoffReport(project),
    );
    assert.deepEqual(
      runJson("pnpm exec tsx src/cli.ts next loop-engine --json"),
      generateNextProjectActionReport(project),
    );
    assert.deepEqual(
      runJson("pnpm exec tsx src/cli.ts prompt loop-engine --json"),
      generateProjectPromptReport(project),
    );

    const { diff: _diff, ...reviewReport } = generateReviewReport(project);
    assert.deepEqual(
      runJson("pnpm exec tsx src/cli.ts review loop-engine --json"),
      reviewReport,
    );
  });

  it("preserves the audit, manifest, and execution report contracts", () => {
    const audit = generateAuditReport();
    const { generatedAt: _generatedAt, ...auditWithoutTimestamp } = audit;
    const secondAudit = generateAuditReport();
    const { generatedAt: _secondGeneratedAt, ...secondWithoutTimestamp } =
      secondAudit;
    assert.deepEqual(auditWithoutTimestamp, secondWithoutTimestamp);

    assert.deepEqual(
      runJson("pnpm exec tsx src/cli.ts audit --manifest"),
      generateAuditRuleManifest(),
    );

    const result = runLoopPlan("loop-engine");
    assert.deepEqual(generateExecutionReport(result), result);
  });

  it("keeps CLI adapters behind the Core boundary", () => {
    const commandFiles = [
      "audit.ts",
      "context.ts",
      "doctor.ts",
      "handoff.ts",
      "next.ts",
      "prompt.ts",
      "rag-index.ts",
      "rag-search.ts",
      "review.ts",
      "run.ts",
      "status.ts",
      "summary.ts",
      "validate.ts",
    ];

    for (const file of commandFiles) {
      const source = readFileSync(`src/commands/${file}`, "utf8");
      assert.match(source, /\.\.\/core\/index\.js/);
      assert.doesNotMatch(
        source,
        /\.\.\/(audit|loop|execution|intelligence|policy|context)\//,
      );
    }

    const cli = readFileSync("src/cli.ts", "utf8");
    assert.match(cli, /from "\.\/core\/index\.js"/);
    assert.doesNotMatch(cli, /from "\.\/core\/(config|project)\.js"/);
  });
});
