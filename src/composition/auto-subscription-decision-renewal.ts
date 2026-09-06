import { spawn } from "node:child_process";
import { lstatSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { ProjectConfig } from "../core/config.js";
import {
  generateProjectReport,
  generateRoadmapOverviewReport,
} from "../core/reports.js";
import { resolveSelectedLotWritablePaths } from "../core/selected-lot-detail.js";
import {
  createExecutionDecisionDraft,
  type ExecutionDecisionDraft,
} from "../governance/execution-decision-draft.js";
import {
  serializeReadyExecutionDecision,
} from "../governance/execution-decision-approval.js";
import {
  createProductionTransactionPort,
  validatePublishedExecutionDecision,
  type ProductionCurrent,
} from "../governance/execution-decision-production.js";
import {
  buildRepositoryPathHints,
  EXECUTION_DECISION_PROPOSAL_SCHEMA,
  EXECUTION_DECISION_PROPOSAL_SYSTEM_PROMPT,
  parseExecutionDecisionProviderProposal,
} from "../governance/execution-decision-provider.js";
import { resolveExecutionAuthorization } from "../governance/execution-authorization.js";
import {
  evaluateAutoSubscriptionAdmission,
  type AutoSubscriptionAdmission,
} from "./auto-subscription-admission.js";
import { buildSubscriptionCliEnvironment } from "../loop/subscription-cli-environment.js";
import { isPathAllowed, parseAllowedPaths } from "../loop/file-scope.js";

export const AUTO_SUBSCRIPTION_DECISION_MODEL = "claude-haiku-4-5";
export const AUTO_SUBSCRIPTION_DECISION_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 512 * 1024;
const MAX_CONTEXT_BYTES = 160 * 1024;

const RENEWABLE_AUTHORIZATION_CODES = new Set([
  "decision_missing",
  "decision_malformed",
  "scope_missing",
  "scope_malformed",
  "sha_stale",
  "decision_revalidation_required",
]);

type ClaudeDecisionProcessResult = Readonly<{
  exitCode: number;
  stdout: string;
  timedOut: boolean;
  outputLimited: boolean;
}>;

export type AutoSubscriptionDecisionRenewalErrorCode =
  | Exclude<AutoSubscriptionAdmission, { ok: true }>["code"]
  | "auto_subscription_requires_detailed_brief"
  | "auto_subscription_requires_detailed_scope"
  | "auto_subscription_decision_timeout"
  | "auto_subscription_decision_output_limit"
  | "auto_subscription_decision_provider_failed"
  | "auto_subscription_decision_invalid_output"
  | "auto_subscription_decision_invalid_scope"
  | "auto_subscription_decision_write_failed"
  | "auto_subscription_decision_post_write_invalid"
  | "auto_subscription_decision_recovery_failed"
  | "auto_subscription_decision_commit_failed";

type AutoSubscriptionDecisionFailure = Readonly<{
  ok: false;
  code: AutoSubscriptionDecisionRenewalErrorCode;
  message: string;
}>;

export type AutoSubscriptionDecisionRenewalResult =
  | Readonly<{ ok: true; status: "reused" | "renewed"; model?: string }>
  | AutoSubscriptionDecisionFailure;

export type AutoSubscriptionDecisionRenewalDependencies = Readonly<{
  runClaude?: (
    args: readonly string[],
    cwd: string,
  ) => Promise<ClaudeDecisionProcessResult>;
}>;

function failure(
  code: AutoSubscriptionDecisionRenewalErrorCode,
  message: string,
): AutoSubscriptionDecisionFailure {
  return Object.freeze({ ok: false as const, code, message });
}

function runClaudeProcess(
  args: readonly string[],
  cwd: string,
): Promise<ClaudeDecisionProcessResult> {
  return new Promise((resolvePromise) => {
    const child = spawn("claude", [...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: buildSubscriptionCliEnvironment(process.env, {
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      }),
    });

    let stdout = "";
    let observedBytes = 0;
    let settled = false;
    let timedOut = false;
    let outputLimited = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, AUTO_SUBSCRIPTION_DECISION_TIMEOUT_MS);

    const settle = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(
        Object.freeze({
          exitCode,
          stdout,
          timedOut,
          outputLimited,
        }),
      );
    };

    const consume = (chunk: Buffer, capture: boolean): void => {
      observedBytes += chunk.byteLength;
      if (observedBytes > MAX_OUTPUT_BYTES) {
        outputLimited = true;
        child.kill("SIGTERM");
        return;
      }
      if (capture) stdout += chunk.toString("utf8");
    };

    child.stdout?.on("data", (chunk: Buffer) => consume(chunk, true));
    child.stderr?.on("data", (chunk: Buffer) => consume(chunk, false));
    child.once("error", () => settle(127));
    child.once("close", (code) => settle(code ?? 1));
  });
}

function parseClaudeStructuredOutput(stdout: string): unknown | null {
  try {
    const root: unknown = JSON.parse(stdout);
    if (typeof root !== "object" || root === null || Array.isArray(root)) {
      return null;
    }
    const record = root as Record<string, unknown>;
    if (record.is_error === true) return null;
    if (record.subtype !== undefined && record.subtype !== "success") return null;
    return record.structured_output ?? null;
  } catch {
    return null;
  }
}

type AutoDecisionContext =
  | Readonly<{
      ok: true;
      current: ProductionCurrent;
      contextJson: string;
      governedAllowedPaths: readonly string[];
    }>
  | Readonly<{
      ok: false;
      reason: "brief" | "scope";
    }>;

function buildDecisionContext(
  project: ProjectConfig,
  currentGitHead: string,
  candidateId: string,
): AutoDecisionContext {
  const snapshot = generateProjectReport(project);
  const overview = generateRoadmapOverviewReport(project);
  const candidate = overview.roadmap.selectedCandidate;

  if (
    candidate === null ||
    candidate.id !== candidateId ||
    candidate.status === "done" ||
    candidate.admissibility?.state === "not_admissible" ||
    !candidate.path
  ) {
    return Object.freeze({ ok: false as const, reason: "brief" as const });
  }

  const detail = overview.roadmap.selectedLotDetail;
  if (detail === null) {
    return Object.freeze({ ok: false as const, reason: "brief" as const });
  }

  const documentedPaths = resolveSelectedLotWritablePaths(
    detail,
    candidate.path,
  );
  const parsedScope = parseAllowedPaths(documentedPaths ?? undefined);
  if (!parsedScope.ok) {
    return Object.freeze({ ok: false as const, reason: "scope" as const });
  }

  const decisionPath = project.execution_decision!;
  const protectedScope =
    parsedScope.allowedPaths.some(
      (path) =>
        path === ".git" ||
        path.startsWith(".git/") ||
        path === ".governance" ||
        path.startsWith(".governance/") ||
        path === ".loop-engine" ||
        path.startsWith(".loop-engine/"),
    ) || isPathAllowed(decisionPath, parsedScope.allowedPaths);
  if (protectedScope) {
    return Object.freeze({ ok: false as const, reason: "scope" as const });
  }

  const projectPath = resolve(project.path);
  const context = {
    project: {
      name: project.name,
      type: project.type,
      objective: snapshot.objective.content ?? null,
    },
    candidate: {
      id: candidate.id,
      text: candidate.text,
      source: candidate.path,
      detail,
    },
    repositoryPathHints: buildRepositoryPathHints(projectPath, candidate.path),
    validation: snapshot.validation.commands,
    constraints: {
      authorizationAction: "explicit_continue",
      sourceGitHead: currentGitHead,
      decisionPath: project.execution_decision,
      governedAllowedPaths: parsedScope.allowedPaths,
      noProviderChoice: true,
      noCommitPushMergeDeploy: true,
    },
  };
  const contextJson = JSON.stringify(context);
  if (Buffer.byteLength(contextJson, "utf8") > MAX_CONTEXT_BYTES) {
    return Object.freeze({ ok: false as const, reason: "brief" as const });
  }

  return Object.freeze({
    ok: true as const,
    current: Object.freeze({
      project: project.name,
      projectPath,
      candidateId,
      gitHead: currentGitHead,
      sourceDocument: candidate.path,
      executionDecisionPath: decisionPath,
      projectConfig: project,
    }),
    contextJson,
    governedAllowedPaths: parsedScope.allowedPaths,
  });
}

function buildClaudeArgs(contextJson: string): readonly string[] {
  return Object.freeze([
    "--restricted",
    "--print",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(EXECUTION_DECISION_PROPOSAL_SCHEMA),
    "--permission-mode",
    "plan",
    "--tools",
    "",
    "--disallowedTools",
    "mcp__*",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--max-turns",
    "3",
    "--model",
    AUTO_SUBSCRIPTION_DECISION_MODEL,
    "--effort",
    "low",
    "--system-prompt",
    EXECUTION_DECISION_PROPOSAL_SYSTEM_PROMPT,
    contextJson,
  ]);
}

async function prepareDecisionDraft(
  current: ProductionCurrent,
  contextJson: string,
  governedAllowedPaths: readonly string[],
  runClaude: NonNullable<AutoSubscriptionDecisionRenewalDependencies["runClaude"]>,
): Promise<
  | Readonly<{ ok: true; draft: ExecutionDecisionDraft }>
  | AutoSubscriptionDecisionFailure
> {
  const result = await runClaude(buildClaudeArgs(contextJson), current.projectPath);
  if (result.timedOut) {
    return failure("auto_subscription_decision_timeout", "Execution decision preparation timed out.");
  }
  if (result.outputLimited) {
    return failure("auto_subscription_decision_output_limit", "Execution decision preparation exceeded its output limit.");
  }
  if (result.exitCode !== 0) {
    return failure("auto_subscription_decision_provider_failed", "Claude Code could not prepare the execution decision.");
  }

  const structured = parseClaudeStructuredOutput(result.stdout);
  const proposal = parseExecutionDecisionProviderProposal(structured);
  if (proposal === null) {
    return failure("auto_subscription_decision_invalid_output", "Claude Code returned an invalid execution decision draft.");
  }

  const draft = createExecutionDecisionDraft(
    {
      project: current.project,
      candidateId: current.candidateId,
      sourceDocument: current.sourceDocument,
      gitHead: current.gitHead,
      executionDecisionPath: current.executionDecisionPath,
    },
    Object.freeze({
      ...proposal,
      allowedPaths: governedAllowedPaths,
    }),
  );
  if (!draft.ok) {
    return failure(
      "auto_subscription_decision_invalid_scope",
      `Execution decision draft rejected: ${draft.reason}`,
    );
  }

  return Object.freeze({ ok: true as const, draft: draft.draft });
}

function ensureLocalDecisionDirectory(
  current: ProductionCurrent,
): AutoSubscriptionDecisionFailure | null {
  if (dirname(current.executionDecisionPath) !== ".loop-engine") {
    return null;
  }

  const directory = resolve(current.projectPath, ".loop-engine");
  try {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      return failure(
        "auto_subscription_decision_write_failed",
        "Local execution decision directory is not a real directory.",
      );
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      return failure(
        "auto_subscription_decision_write_failed",
        "Local execution decision directory could not be inspected.",
      );
    }

    try {
      mkdirSync(directory, { mode: 0o700 });
    } catch {
      return failure(
        "auto_subscription_decision_write_failed",
        "Local execution decision directory could not be created.",
      );
    }
  }

  return null;
}

async function publishDecision(
  current: ProductionCurrent,
  draft: ExecutionDecisionDraft,
): Promise<AutoSubscriptionDecisionRenewalResult> {
  const publish = createProductionTransactionPort();
  const publication = await publish(
    current,
    serializeReadyExecutionDecision(draft),
  );
  if (!publication.ok) {
    return failure(
      "auto_subscription_decision_write_failed",
      `Execution decision publication failed: ${publication.code}.`,
    );
  }

  let valid = false;
  try {
    valid = validatePublishedExecutionDecision(current, draft);
  } catch {
    valid = false;
  }
  if (!valid) {
    const recovered = publication.recover();
    return failure(
      recovered
        ? "auto_subscription_decision_post_write_invalid"
        : "auto_subscription_decision_recovery_failed",
      recovered
        ? "Execution decision failed post-write validation and was rolled back."
        : "Execution decision validation failed and rollback was unsuccessful.",
    );
  }

  if (!publication.commit()) {
    return failure(
      "auto_subscription_decision_commit_failed",
      "Execution decision publication could not be finalized.",
    );
  }

  return Object.freeze({
    ok: true as const,
    status: "renewed" as const,
    model: AUTO_SUBSCRIPTION_DECISION_MODEL,
  });
}

function isRenewalAllowed(
  project: ProjectConfig,
  currentGitHead: string,
  candidateId: string,
): boolean {
  const authorization = resolveExecutionAuthorization(
    project,
    resolve(project.path),
    currentGitHead,
  );

  if (!authorization.governed) return false;
  if (!authorization.authorized) {
    return RENEWABLE_AUTHORIZATION_CODES.has(authorization.code);
  }

  return (
    authorization.candidateId !== candidateId ||
    authorization.brief === undefined
  );
}

/**
 * Makes an explicitly opted-in AUTO subscription decision current for the
 * exact candidate/SHA verified by the caller.
 *
 * A fresh decision is reused. Missing/stale/revalidation-required decisions
 * may be renewed only after an explicit Continue action has already selected
 * the canonical candidate and exact Git SHA. BLOCKED/NO_ACTIONABLE_WORK and
 * malformed project identity remain fail-closed.
 *
 * The proposal call uses Claude Code subscription auth, Haiku, restricted
 * mode, no built-in tools, no MCP tools, a JSON schema, and no API key.
 * Claude only proposes a draft; Loop Engine validates and authorizes it.
 */
export async function ensureAutoSubscriptionExecutionDecision(
  project: ProjectConfig,
  currentGitHead: string,
  candidateId: string,
  dependencies: AutoSubscriptionDecisionRenewalDependencies = {},
): Promise<AutoSubscriptionDecisionRenewalResult> {
  const existing = evaluateAutoSubscriptionAdmission(
    project,
    currentGitHead,
    candidateId,
  );
  if (existing.ok) {
    return Object.freeze({ ok: true as const, status: "reused" as const });
  }

  if (
    typeof project.execution_decision !== "string" ||
    project.execution_decision.trim().length === 0
  ) {
    return existing;
  }

  if (!isRenewalAllowed(project, currentGitHead, candidateId)) {
    return existing;
  }

  const context = buildDecisionContext(project, currentGitHead, candidateId);
  if (!context.ok) {
    return context.reason === "scope"
      ? failure(
          "auto_subscription_requires_detailed_scope",
          "Autonomous execution decision renewal requires an explicit deterministic writable scope in the canonical lot detail.",
        )
      : failure(
          "auto_subscription_requires_detailed_brief",
          "Autonomous execution decision renewal requires a documented canonical lot detail.",
        );
  }

  const directoryFailure = ensureLocalDecisionDirectory(context.current);
  if (directoryFailure !== null) return directoryFailure;

  const prepared = await prepareDecisionDraft(
    context.current,
    context.contextJson,
    context.governedAllowedPaths,
    dependencies.runClaude ?? runClaudeProcess,
  );
  if (!prepared.ok) return prepared;

  const published = await publishDecision(context.current, prepared.draft);
  if (!published.ok) return published;

  const finalAdmission = evaluateAutoSubscriptionAdmission(
    project,
    currentGitHead,
    candidateId,
  );
  if (!finalAdmission.ok) return finalAdmission;

  return published;
}
