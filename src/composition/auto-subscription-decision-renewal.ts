import { spawn } from "node:child_process";
import { lstatSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { ProjectConfig } from "../core/config.js";
import {
  generateProjectReport,
  generateRoadmapOverviewReport,
} from "../core/reports.js";
import {
  resolveRoadmapCandidateDetail,
  resolveSelectedLotWritablePaths,
} from "../core/selected-lot-detail.js";
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
import {
  ANTHROPIC_HAIKU_4_5_MODEL,
  ANTHROPIC_SONNET_5_MODEL,
} from "../text-only-provider/pricing.js";

export const AUTO_SUBSCRIPTION_DECISION_MODEL = ANTHROPIC_HAIKU_4_5_MODEL;
export const AUTO_SUBSCRIPTION_DECISION_ESCALATION_MODEL =
  ANTHROPIC_SONNET_5_MODEL;
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
      candidateText: string;
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

  const detail = resolveRoadmapCandidateDetail(project.path, candidate);
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
      providerPhaseEndsBeforeValidation: true,
      validationOwner: "loop_engine",
      providerMustNotExecuteValidation: true,
      planningSourceUpdateMustNotDependOnValidation: true,
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
    candidateText: candidate.text,
    governedAllowedPaths: parsedScope.allowedPaths,
  });
}

type DecisionProposalProfile = Readonly<{
  model: string;
  effort: "low" | "medium";
  corrective: boolean;
}>;

const DECISION_PROPOSAL_PROFILES: readonly DecisionProposalProfile[] =
  Object.freeze([
    Object.freeze({
      model: AUTO_SUBSCRIPTION_DECISION_MODEL,
      effort: "low" as const,
      corrective: false,
    }),
    Object.freeze({
      model: AUTO_SUBSCRIPTION_DECISION_ESCALATION_MODEL,
      effort: "medium" as const,
      corrective: true,
    }),
  ]);

const CONCRETE_CHANGE_PATTERN =
  /\b(add|ajout(?:er)?|implement|impl[eé]ment(?:er)?|fix|corrig(?:er)?|create|cr[eé]er|modify|modifier|update|mettre [aà] jour|expose|exposer|support|supporter|deliver|livrer)\b/i;
const ABSOLUTE_NO_CHANGE_PATTERNS = Object.freeze([
  /^modifying files$/i,
  /\bno (?:file modifications?|file changes?)\b/i,
  /\bwithout (?:file modifications?|file changes?)\b/i,
  /\baucune modification(?: de fichiers?)?\b/i,
]);
const CODE_CHANGE_DENIAL_PATTERNS = Object.freeze([
  /^implementation$/i,
  /^writing code$/i,
  /\bno (?:implementation|code changes?)\b/i,
  /\bwithout (?:implementation|code changes?)\b/i,
  /\bpas d['’]impl[eé]mentation\b/i,
]);

const PROVIDER_PHASE_VALIDATION_PATTERNS = Object.freeze([
  /\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:ci|test|validate|lint|typecheck)\b/i,
  /\b(?:run|execute|rerun|re-run)\b.{0,80}\b(?:tests?|validation|ci|lint|typecheck)\b/i,
  /\b(?:ci|tests?|validation|lint|typecheck)\b.{0,80}\b(?:must|should|needs? to)\s+pass\b/i,
  /\b(?:after|once|when)\b.{0,80}\b(?:ci|tests?|validation)\b.{0,40}\bpass(?:es|ed)?\b/i,
  /\bwait(?:ing)? for\b.{0,80}\b(?:ci|validation|tests?)\b/i,
]);

function hasCodeWritablePath(paths: readonly string[]): boolean {
  return paths.some(
    (path) =>
      path.startsWith("src/") ||
      path.startsWith("tests/") ||
      /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift|rb|php|cs)$/i.test(path),
  );
}

function proposalContradictsConcreteCandidate(
  candidateText: string,
  governedAllowedPaths: readonly string[],
  proposal: Readonly<{ outOfScope: unknown; deliverables: unknown }>,
): boolean {
  if (
    !Array.isArray(proposal.outOfScope) ||
    !proposal.outOfScope.every((item) => typeof item === "string") ||
    !Array.isArray(proposal.deliverables) ||
    !proposal.deliverables.every((item) => typeof item === "string")
  ) {
    return false;
  }
  const outOfScope = proposal.outOfScope.map((item) => item.trim());
  const deliverables = proposal.deliverables.map((item) => item.trim());
  if (
    deliverables.some((item) =>
      PROVIDER_PHASE_VALIDATION_PATTERNS.some((pattern) => pattern.test(item)),
    )
  ) {
    return true;
  }
  if (
    outOfScope.some((item) =>
      ABSOLUTE_NO_CHANGE_PATTERNS.some((pattern) => pattern.test(item)),
    )
  ) {
    return true;
  }
  if (
    !CONCRETE_CHANGE_PATTERN.test(candidateText) ||
    !hasCodeWritablePath(governedAllowedPaths)
  ) {
    return false;
  }
  return outOfScope.some((item) =>
    CODE_CHANGE_DENIAL_PATTERNS.some((pattern) => pattern.test(item)),
  );
}

function buildClaudeArgs(
  contextJson: string,
  profile: DecisionProposalProfile,
): readonly string[] {
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
    profile.model,
    "--effort",
    profile.effort,
    "--system-prompt",
    profile.corrective
      ? `${EXECUTION_DECISION_PROPOSAL_SYSTEM_PROMPT} A lower-tier proposal was rejected because it contradicted the canonical requested change or assigned post-provider validation work to the provider. Preserve the concrete implementation outcome; never place required implementation, writing code, or modifying files in outOfScope; and never require the provider to run validation, make CI pass, wait for validation, or condition the planning-source update on validation.`
      : EXECUTION_DECISION_PROPOSAL_SYSTEM_PROMPT,
    contextJson,
  ]);
}

async function prepareDecisionDraft(
  current: ProductionCurrent,
  contextJson: string,
  candidateText: string,
  governedAllowedPaths: readonly string[],
  runClaude: NonNullable<AutoSubscriptionDecisionRenewalDependencies["runClaude"]>,
): Promise<
  | Readonly<{ ok: true; draft: ExecutionDecisionDraft; model: string }>
  | AutoSubscriptionDecisionFailure
> {
  let lastFailure: AutoSubscriptionDecisionFailure | null = null;

  for (const profile of DECISION_PROPOSAL_PROFILES) {
    const result = await runClaude(
      buildClaudeArgs(contextJson, profile),
      current.projectPath,
    );
    if (result.timedOut) {
      return failure(
        "auto_subscription_decision_timeout",
        "Execution decision preparation timed out.",
      );
    }
    if (result.outputLimited) {
      return failure(
        "auto_subscription_decision_output_limit",
        "Execution decision preparation exceeded its output limit.",
      );
    }
    if (result.exitCode !== 0) {
      return failure(
        "auto_subscription_decision_provider_failed",
        "Claude Code could not prepare the execution decision.",
      );
    }

    const structured = parseClaudeStructuredOutput(result.stdout);
    const proposal = parseExecutionDecisionProviderProposal(structured);
    if (proposal === null) {
      lastFailure = failure(
        "auto_subscription_decision_invalid_output",
        `Claude Code ${profile.model} returned an invalid execution decision draft.`,
      );
      continue;
    }

    if (
      proposalContradictsConcreteCandidate(
        candidateText,
        governedAllowedPaths,
        proposal,
      )
    ) {
      lastFailure = failure(
        "auto_subscription_decision_invalid_output",
        `Claude Code ${profile.model} produced a brief that contradicts the canonical requested change.`,
      );
      continue;
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
      lastFailure = failure(
        "auto_subscription_decision_invalid_scope",
        `Execution decision draft rejected: ${draft.reason}`,
      );
      continue;
    }

    return Object.freeze({
      ok: true as const,
      draft: draft.draft,
      model: profile.model,
    });
  }

  return (
    lastFailure ??
    failure(
      "auto_subscription_decision_invalid_output",
      "Claude Code could not produce a coherent execution decision draft.",
    )
  );
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
  model: string,
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
    model,
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
 * The proposal call uses Claude Code subscription auth, Haiku first,
 * restricted mode, no built-in tools, no MCP tools, a JSON schema, and no API
 * key. If the economy draft is malformed or contradicts a concrete canonical
 * change, one bounded Sonnet 5 / medium retry is allowed. Claude only proposes
 * a draft; Loop Engine validates and authorizes it.
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
    context.candidateText,
    context.governedAllowedPaths,
    dependencies.runClaude ?? runClaudeProcess,
  );
  if (!prepared.ok) return prepared;

  const published = await publishDecision(
    context.current,
    prepared.draft,
    prepared.model,
  );
  if (!published.ok) return published;

  const finalAdmission = evaluateAutoSubscriptionAdmission(
    project,
    currentGitHead,
    candidateId,
  );
  if (!finalAdmission.ok) return finalAdmission;

  return published;
}
