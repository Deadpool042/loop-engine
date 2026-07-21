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
  loadConfig,
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
    assert.equal(typeof resolveRuntime, "function");
    assert.equal(typeof executeRuntime, "function");
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
