import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { createAgentRegistry } from "../src/agents/registry.js";
import type { AgentProfile } from "../src/agents/types.js";
import type { Config, ProjectConfig } from "../src/core/config.js";
import { generateExecutionReportWithEvidence } from "../src/core/loop-execution-plan-evidence-report.js";
import type { RoadmapCandidate } from "../src/intelligence/roadmap.js";
import type { ProjectSnapshot } from "../src/intelligence/snapshot.js";
import { DEFAULT_AGENT_POLICY } from "../src/policy/defaults.js";
import { inspectWorktreeContentPolicy } from "../src/loop/content-policy.js";
import { runLoopExecute } from "../src/loop/execute-runner.js";
import type { LoopExecutionPlan } from "../src/loop/execution-plan.js";
import type { LoopExecutor, LoopExecutorResult } from "../src/loop/execution.js";
import { admitProviderWorktree } from "../src/loop/provider-worktree-admission.js";
import { readModifiedWorktreeFiles } from "../src/loop/worktree-status.js";

const TARGET_OPENCLAW_VERSION = "2026.9.4";
const TARGET_ACPX_VERSION = "0.13.2";
const AGENT_SCRIPT = "/home/ubuntu/Projects/openclaw-control/scripts/oc14-acp-fs-probe-agent.mjs";
const REPORT_PREFIX = "OC14_ACP_FS_REPORT:";
const ALLOWED_FILE = "allowed.txt";
const OUTSIDE_FILE = "outside.txt";
const WRITE_TOKEN = `OC14_LOOP_NATIVE_${Date.now()}`;

function resolveAcpx(): { cliPath: string; sdkRoot: string; version: string } {
  const projectsRoot = join(homedir(), ".openclaw", "npm", "projects");
  for (const entry of readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("openclaw-acpx-")) continue;
    const root = join(projectsRoot, entry.name);
    const acpxRoot = join(root, "node_modules", "acpx");
    const packagePath = join(acpxRoot, "package.json");
    const sdkRoot = join(root, "node_modules", "@agentclientprotocol", "sdk");
    try {
      const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: string };
      const cliPath = [join(acpxRoot, "dist", "cli.js"), join(acpxRoot, "dist", "cli.mjs")]
        .find((candidate) => {
          try { readFileSync(candidate); return true; } catch { return false; }
        });
      readFileSync(join(sdkRoot, "dist", "acp.js"));
      if (cliPath && pkg.version) return { cliPath, sdkRoot, version: pkg.version };
    } catch {}
  }
  throw new Error("OpenClaw-managed ACPx installation not found.");
}

function fixtureCandidate(): RoadmapCandidate {
  return {
    path: "roadmap.md",
    line: 1,
    text: "- [ ] OC14 native governance probe",
    kind: "safe",
    reason: "bounded qualification probe",
    status: "todo",
    priority: "default",
  };
}

function fixtureSnapshot(project: ProjectConfig, candidate: RoadmapCandidate): ProjectSnapshot {
  return {
    project: { name: project.name, type: project.type, path: project.path },
    git: { branch: "main", clean: true, requiresGit: true, statusText: "", lastCommit: null },
    docs: { required: [], missing: [] },
    validation: { commands: project.validation, configured: true },
    roadmap: {
      available: true,
      paths: ["roadmap.md"],
      candidates: [candidate],
      selectedCandidate: candidate,
      stats: { total: 1, todo: 1, inProgress: 0, done: 0, unknown: 0, safe: 1, warning: 0, blocked: 0 },
      summary: { active: 1, done: 0, selectable: 1, hasBlocked: false },
    },
    health: "good",
  };
}

function profile(): AgentProfile {
  return {
    id: "oc14.openclaw-native",
    runtime: "openclaw",
    provider: "local",
    model: "acpx-0.13.2",
    effort: "low",
    economicTier: "economy",
    availability: "available",
    capabilities: ["code_edit", "shell_exec", "test_execution"],
    permissions: ["read_only", "write_worktree", "shell_exec"],
    budget: { maxTokens: null, maxCostUsd: null, maxDurationMs: 60_000, maxCalls: 1, maxRepairs: 0 },
  };
}

function createRepo(root: string, name: string, runtime: ReturnType<typeof resolveAcpx>): ProjectConfig {
  const cwd = join(root, name);
  mkdirSync(cwd, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "oc14@example.invalid"], { cwd });
  execFileSync("git", ["config", "user.name", "OC14 Probe"], { cwd });
  writeFileSync(join(cwd, ".acpxrc.json"), `${JSON.stringify({ agents: { "oc14-fs-probe": { argv: [process.execPath, AGENT_SCRIPT, runtime.sdkRoot] } } }, null, 2)}\n`);
  writeFileSync(join(cwd, "roadmap.md"), "- [ ] OC14 native governance probe\n");
  writeFileSync(join(cwd, "validate.mjs"), `import fs from 'node:fs';\nconst p='${ALLOWED_FILE}';\nif(!fs.existsSync(p)||fs.readFileSync(p,'utf8').trim()!=='${WRITE_TOKEN}') process.exit(7);\n`);
  execFileSync("git", ["add", "."], { cwd });
  execFileSync("git", ["commit", "-q", "-m", "probe baseline"], { cwd });
  return { name, path: cwd, type: "test", required_docs: [], validation: ["node validate.mjs"], roadmap: ["roadmap.md"], requires_git: true };
}

function config(project: ProjectConfig): Config { return { projects: [project] }; }

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, output);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectStrings(item, output);
  return output;
}

function parseReport(stdout: string): any {
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const event = JSON.parse(line);
      for (const text of collectStrings(event)) {
        const index = text.indexOf(REPORT_PREFIX);
        if (index < 0) continue;
        return JSON.parse(text.slice(index + REPORT_PREFIX.length).trim());
      }
    } catch {}
  }
  return null;
}

function nativeExecutor(runtime: ReturnType<typeof resolveAcpx>, targetFile: string, audit: any): LoopExecutor {
  return async (plan: LoopExecutionPlan, cwd: string): Promise<LoopExecutorResult> => {
    const before = await readModifiedWorktreeFiles(cwd);
    if (before === null) return { status: "failed", modifiedFiles: [], failure: { code: "worktree_status_failed", message: "Unable to verify worktree baseline.", details: [] } };
    const admission = admitProviderWorktree(plan, before);
    audit.baseline = { before, admission };
    if (!admission.ok) return { status: "failed", modifiedFiles: before, failure: { code: admission.code, message: admission.message, details: [] } };

    audit.nativeCalls += 1;
    const targetPath = join(cwd, targetFile);
    const env = {
      ...process.env,
      NO_BROWSER: "1",
      OC14_PROBE_MODE: "write",
      OC14_INSIDE_PATH: join(cwd, "roadmap.md"),
      OC14_OUTSIDE_PATH: join(cwd, "..", "outside-host-scope.txt"),
      OC14_WRITE_PATH: targetPath,
      OC14_WRITE_TOKEN: WRITE_TOKEN,
    };
    delete env.OPENAI_API_KEY;
    delete env.CODEX_API_KEY;
    delete env.ANTHROPIC_API_KEY;
    const child = spawnSync(process.execPath, [
      runtime.cliPath,
      "--cwd", cwd,
      "--format", "json",
      "--json-strict",
      "--non-interactive-permissions", "deny",
      "--no-terminal",
      "--approve-all",
      "--timeout", "20",
      "oc14-fs-probe",
      "exec",
      "write",
    ], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    const report = parseReport(child.stdout ?? "");
    audit.native = {
      exitCode: child.status,
      acpxVersion: runtime.version,
      cwd: report?.cwd ?? null,
      terminalAdvertised: report?.capabilities?.terminal ?? null,
      writeReportedOk: report?.write?.ok ?? null,
      modelUsed: false,
      targetFile,
    };
    const after = await readModifiedWorktreeFiles(cwd);
    if (child.status !== 0 || !report || report.write?.ok !== true || after === null) {
      return { status: "failed", modifiedFiles: after ?? [], failure: { code: "provider_failed", message: "OpenClaw-managed ACPx qualification execution failed.", details: [] } };
    }
    return { status: "completed", modifiedFiles: after, details: [`OpenClaw-managed ACPx ${runtime.version} completed a bounded native filesystem run.`] };
  };
}

async function runCase(project: ProjectConfig, runtime: ReturnType<typeof resolveAcpx>, targetFile: string, dirtyBaseline = false) {
  const candidate = fixtureCandidate();
  const snapshot = fixtureSnapshot(project, candidate);
  const audit: any = { nativeCalls: 0 };
  if (dirtyBaseline) writeFileSync(join(project.path, ALLOWED_FILE), "preexisting dirty delta\n");
  const result = await runLoopExecute(project.name, {
    now: (() => { let i = 0; return () => `2026-09-12T21:00:${String(i++).padStart(2, "0")}.000Z`; })(),
    generateRunId: () => `oc14-${project.name}`,
    loadConfig: () => config(project),
    planLoopCycle: () => ({
      outcome: "ready" as const,
      candidate,
      plannedSteps: ["Execute native OpenClaw", "Validate governed delta"],
      snapshot,
      authorizedBy: "execution_decision" as const,
      allowedPaths: [ALLOWED_FILE],
      brief: {
        objective: "Write only the approved OC-14 probe artifact.",
        deliverables: [ALLOWED_FILE],
        outOfScope: ["Every other path"],
        forbiddenContentTerms: ["FORBIDDEN_OC14"],
      },
    }),
    buildMinimalContext: (_snapshot, budget) => ({ project: project.name, budget, files: [], omitted: [], totalCharacters: 0, estimatedTokens: 0, truncated: false }),
    agentPolicy: Object.freeze({ ...DEFAULT_AGENT_POLICY, allowEscalation: false }),
    agentRegistry: createAgentRegistry([profile()]),
    readModifiedWorktreeFiles,
    executor: nativeExecutor(runtime, targetFile, audit),
    maxRepairs: 0,
    maxModelAttempts: 1,
  });
  const evidence = generateExecutionReportWithEvidence(result);
  const contentInspection = await inspectWorktreeContentPolicy(
    {
      schemaVersion: 1,
      runId: result.runId,
      project: { name: project.name },
      candidate,
      contextPackage: { project: project.name, budget: { maxFiles: 1, maxCharacters: 1, maxEstimatedTokens: 1, includeFullFiles: false }, files: [], omitted: [], totalCharacters: 0, estimatedTokens: 0, truncated: false },
      allowedPaths: [ALLOWED_FILE],
      provider: profile().provider,
      runtime: profile().runtime,
      profileId: profile().id,
      model: profile().model,
      effort: "low",
      delegation: { mode: "direct_preferred", reason: "low_effort" },
      budget: profile().budget,
      policy: { id: "oc14", mode: "execute", status: "resolved", requiredCapabilities: [], requiredPermissions: [], rationale: [] },
      brief: { objective: "Write only the approved OC-14 probe artifact.", deliverables: [ALLOWED_FILE], outOfScope: ["Every other path"], forbiddenContentTerms: ["FORBIDDEN_OC14"] },
    },
    project.path,
    result.modifiedFiles,
  );
  return { result, evidence, audit, contentInspection };
}

const root = mkdtempSync(join(tmpdir(), "oc14-loop-openclaw-governance-"));
try {
  const runtime = resolveAcpx();
  if (runtime.version !== TARGET_ACPX_VERSION) throw new Error(`Expected ACPx ${TARGET_ACPX_VERSION}, got ${runtime.version}.`);

  const positiveProject = createRepo(root, "positive", runtime);
  const positive = await runCase(positiveProject, runtime, ALLOWED_FILE);

  const scopeProject = createRepo(root, "scope-negative", runtime);
  const scopeNegative = await runCase(scopeProject, runtime, OUTSIDE_FILE);

  const baselineProject = createRepo(root, "baseline-negative", runtime);
  const baselineNegative = await runCase(baselineProject, runtime, ALLOWED_FILE, true);

  const report = {
    schemaVersion: 1,
    targetOpenClawVersion: TARGET_OPENCLAW_VERSION,
    runtime: { kind: "OpenClaw-managed ACPx", version: runtime.version, modelUsed: false },
    positive: {
      status: positive.result.status,
      failure: positive.result.failure,
      modifiedFiles: positive.result.modifiedFiles,
      validation: positive.result.validation,
      contentPolicy: positive.contentInspection.outcome,
      writableFileScope: positive.result.writableFileScope,
      steps: positive.result.steps.map((step) => step.name),
      native: positive.audit.native,
      baseline: positive.audit.baseline,
      evidencePresent: positive.evidence.executionPlanEvidence !== null,
      executionPlanEvidence: positive.evidence.executionPlanEvidence,
    },
    scopeNegative: {
      status: scopeNegative.result.status,
      failureCode: scopeNegative.result.failure?.code ?? null,
      modifiedFiles: scopeNegative.result.modifiedFiles,
      validation: scopeNegative.result.validation,
      native: scopeNegative.audit.native,
      baseline: scopeNegative.audit.baseline,
    },
    baselineNegative: {
      status: baselineNegative.result.status,
      failureCode: baselineNegative.result.failure?.code ?? null,
      modifiedFiles: baselineNegative.result.modifiedFiles,
      nativeCalls: baselineNegative.audit.nativeCalls,
      baseline: baselineNegative.audit.baseline,
    },
  };

  const proved =
    positive.result.status === "completed" &&
    positive.result.validation?.status === "passed" &&
    positive.result.modifiedFiles.length === 1 && positive.result.modifiedFiles[0] === ALLOWED_FILE &&
    positive.contentInspection.outcome === "compliant" &&
    positive.audit.baseline?.admission?.ok === true &&
    positive.audit.native?.cwd === positiveProject.path &&
    positive.audit.native?.terminalAdvertised === false &&
    positive.evidence.executionPlanEvidence !== null &&
    scopeNegative.result.status === "failed" &&
    scopeNegative.result.failure?.code === "scope_violation" &&
    scopeNegative.result.validation === null &&
    scopeNegative.result.modifiedFiles.includes(OUTSIDE_FILE) &&
    baselineNegative.result.status === "failed" &&
    baselineNegative.result.failure?.code === "worktree_not_clean" &&
    baselineNegative.audit.nativeCalls === 0;

  process.stdout.write(`${JSON.stringify({ ...report, proved }, null, 2)}\n`);
  if (!proved) process.exitCode = 1;
} finally {
  rmSync(root, { recursive: true, force: true });
}
