import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import type { Config, ProjectConfig } from "./config.js";
import { docExists } from "./docs.js";
import { isGitRepository } from "./git.js";
import { LOOP_RUN_STATUSES, type LoopRunResult } from "../loop/types.js";
import {
  DEFAULT_RUN_HISTORY_LIMIT,
  InvalidRunHistoryProjectIdentityError,
  MAX_RUN_HISTORY_LIMIT,
  resolveRunHistoryFilePath,
} from "./run-history.js";
import { buildProjectSnapshot } from "../intelligence/project-snapshot.js";
import {
  generateRoadmapProposalFromContext,
  type RoadmapProposal,
  ROADMAP_PROPOSAL_ESTIMATED_OUTPUT_TOKENS,
  ROADMAP_PROPOSAL_ESTIMATED_STRUCTURED_OUTPUT_OVERHEAD_TOKENS,
  ROADMAP_PROPOSAL_OUTPUT_SCHEMA,
  ROADMAP_PROPOSAL_SYSTEM_PROMPT,
} from "../intelligence/roadmap-proposal.js";
import {
  buildGateReassessmentContext,
  GATE_REASSESSMENT_ESTIMATED_OUTPUT_TOKENS,
  GATE_REASSESSMENT_ESTIMATED_STRUCTURED_OUTPUT_OVERHEAD_TOKENS,
  GATE_REASSESSMENT_OUTPUT_SCHEMA,
  GATE_REASSESSMENT_SYSTEM_PROMPT,
  generateGateReassessmentFromContext,
} from "../intelligence/gate-reassessment.js";
import {
  ROADMAP_PROPOSAL_PROFILES,
  resolveRoadmapProposalProfile,
  selectRoadmapProposalProfile,
} from "../intelligence/roadmap-proposal-routing.js";
import {
  buildCompactRoadmapProposalContext,
  estimateTokenCount,
} from "../intelligence/roadmap-proposal-context-compaction.js";
import {
  calculateCostUsd,
  resolveAnthropicPricing,
  toAnthropicOutputSchema,
  type AnthropicEffort,
  type TextOnlyProvider,
} from "../text-only-provider/index.js";
import {
  boundProposalContextString,
  buildRoadmapProposalContext,
  buildRoadmapRenewalContext,
  MAX_PROPOSAL_CONTEXT_CONFIGURED_PATHS,
  MAX_PROPOSAL_CONTEXT_VALIDATION_COMMANDS,
  projectRoadmapProposalCandidate,
  projectRoadmapProposalStringCollection,
  roadmapCandidateDetailKey,
} from "../intelligence/proposal-context.js";
import {
  changedPathsFromGitDiff,
  createDocumentationImpactReport,
  mergeChangedPaths,
  untrackedPathsFromGitStatus,
} from "../documentation/index.js";
import {
  resolveRoadmapCandidateDetail,
  resolveSelectedLotDetail,
} from "./selected-lot-detail.js";

export function generateProjectReport(project: ProjectConfig) {
  return buildProjectSnapshot(project);
}

export function generateWorkspaceReports(config: Config) {
  return config.projects.map((project) => generateProjectReport(project));
}

export function generateWorkspaceSummaryReport(config: Config) {
  return {
    schemaVersion: 1 as const,
    projects: generateWorkspaceReports(config).map((snapshot) => {
      const runHistory = generateRunHistoryReport(snapshot.project.name, {
        limit: 1,
      });
      return {
        ...snapshot,
        workAvailability: {
          actionable: snapshot.roadmap.selectedCandidate !== null,
          reason: snapshot.planning.recommendation,
        },
        lastRun: runHistory.entries[0]
          ? {
              status: runHistory.entries[0].status,
              completedAt: runHistory.entries[0].completedAt,
            }
          : null,
        ...(runHistory.corruptedLines > 0
          ? { runHistoryCorruptedLines: runHistory.corruptedLines }
          : {}),
        roadmap: {
          available: snapshot.roadmap.available,
          paths: snapshot.roadmap.paths,
          selectedCandidate: snapshot.roadmap.selectedCandidate,
          phaseGates: snapshot.roadmap.phaseGates,
          stats: snapshot.roadmap.stats,
        },
      };
    }),
  };
}

export function generateRoadmapPlanningStatusReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: {
      name: snapshot.project.name,
    },
    planning: snapshot.planning,
  };
}

function buildRoadmapCompletionEvent(
  snapshot: ReturnType<typeof buildProjectSnapshot>,
) {
  const sequencedCandidates = snapshot.roadmap.candidates.filter(
    (candidate) => candidate.status !== "unknown",
  );
  const firstOpenIndex = sequencedCandidates.findIndex(
    (candidate) => candidate.status !== "done",
  );
  const completedIndex =
    firstOpenIndex === -1
      ? sequencedCandidates.length - 1
      : firstOpenIndex - 1;
  const completedCandidate = sequencedCandidates[completedIndex];

  if (!completedCandidate || completedCandidate.status !== "done") {
    return null;
  }

  const stableCandidateIdentity =
    completedCandidate.id ??
    `${completedCandidate.path}:${completedCandidate.line}`;
  const eventId = createHash("sha256")
    .update("lot.completed")
    .update("\0")
    .update(snapshot.project.name)
    .update("\0")
    .update(stableCandidateIdentity)
    .digest("hex")
    .slice(0, 32);

  return Object.freeze({
    schemaVersion: 1 as const,
    type: "lot.completed" as const,
    eventId,
    project: Object.freeze({ name: snapshot.project.name }),
    candidate: projectRoadmapProposalCandidate(completedCandidate),
    nextCandidate:
      snapshot.roadmap.selectedCandidate === null
        ? null
        : projectRoadmapProposalCandidate(snapshot.roadmap.selectedCandidate),
  });
}

/**
 * Deterministic, bounded roadmap projection for external/read-only cockpits.
 * It is intentionally independent from objective/proposal eligibility: a
 * roadmap remains observable even when no objective source is configured.
 * No provider is consulted and no planning decision is recomputed here.
 */
export function generateRoadmapOverviewReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  const projected = buildRoadmapProposalContext(snapshot);

  return Object.freeze({
    schemaVersion: 1 as const,
    project: Object.freeze({
      name: snapshot.project.name,
      type: snapshot.project.type,
    }),
    planning: snapshot.planning,
    roadmap: Object.freeze({
      available: snapshot.roadmap.available,
      paths: Object.freeze([...snapshot.roadmap.paths]),
      selectedCandidate:
        snapshot.roadmap.selectedCandidate === null
          ? null
          : projectRoadmapProposalCandidate(snapshot.roadmap.selectedCandidate),
      selectedLotDetail: resolveSelectedLotDetail(
        snapshot.project.path,
        snapshot.roadmap.selectedCandidate,
      ),
      completionEvent: buildRoadmapCompletionEvent(snapshot),
      candidates: projected.candidates,
      phaseGates: projected.phaseGates,
      stats: snapshot.roadmap.stats,
      summary: snapshot.roadmap.summary,
    }),
    health: snapshot.health,
  });
}

export function generateRoadmapCandidateDetailReport(
  project: ProjectConfig,
  candidateKey: string,
) {
  const snapshot = generateProjectReport(project);
  const projectIdentity = Object.freeze({ name: snapshot.project.name });

  if (!snapshot.roadmap.available) {
    return Object.freeze({
      schemaVersion: 1 as const,
      project: projectIdentity,
      status: "unavailable" as const,
      reason: "roadmap_unavailable",
    });
  }

  if (!/^[a-f0-9]{32}$/.test(candidateKey)) {
    return Object.freeze({
      schemaVersion: 1 as const,
      project: projectIdentity,
      status: "not_found" as const,
      reason: "invalid_candidate_key",
    });
  }

  const candidate = snapshot.roadmap.candidates.find(
    (item) => roadmapCandidateDetailKey(item) === candidateKey,
  );

  if (!candidate) {
    return Object.freeze({
      schemaVersion: 1 as const,
      project: projectIdentity,
      status: "not_found" as const,
      reason: "candidate_not_found",
    });
  }

  const projectedCandidate = projectRoadmapProposalCandidate(candidate);
  const detail = resolveRoadmapCandidateDetail(snapshot.project.path, candidate);

  if (!detail) {
    return Object.freeze({
      schemaVersion: 1 as const,
      project: projectIdentity,
      status: "not_documented" as const,
      reason: "candidate_detail_not_documented",
      candidate: projectedCandidate,
    });
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    project: projectIdentity,
    status: "ok" as const,
    candidate: projectedCandidate,
    detail,
  });
}

export function generateProjectObjectiveReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: {
      name: snapshot.project.name,
    },
    planning: {
      mode: snapshot.planning.mode,
    },
    objective: snapshot.objective,
  };
}

export function generateRoadmapProposalContextReport(
  project: ProjectConfig,
  options: Readonly<{ allowIneligibleObjective?: boolean }> = {},
) {
  const snapshot = generateProjectReport(project);
  const projectName = boundProposalContextString(snapshot.project.name);
  const projectType = boundProposalContextString(snapshot.project.type);
  const objectiveSource =
    snapshot.objective.source === null
      ? null
      : boundProposalContextString(snapshot.objective.source);
  const report = {
    schemaVersion: 1 as const,
    project: {
      name: projectName.value,
      nameTruncated: projectName.truncated,
      type: projectType.value,
      typeTruncated: projectType.truncated,
    },
    planning: {
      mode: snapshot.planning.mode,
    },
    objective: {
      ...snapshot.objective,
      source: objectiveSource?.value ?? null,
      ...(objectiveSource === null
        ? {}
        : { sourceTruncated: objectiveSource.truncated }),
    },
  };

  if (
    !snapshot.objective.eligibleForRoadmapProposal &&
    !options.allowIneligibleObjective
  ) {
    return Object.freeze({
      ...report,
      context: null,
    });
  }

  const proposalContext = buildRoadmapRenewalContext(snapshot);
  const configuredPaths = projectRoadmapProposalStringCollection(
    snapshot.roadmap.paths,
    MAX_PROPOSAL_CONTEXT_CONFIGURED_PATHS,
  );
  const validationCommands = projectRoadmapProposalStringCollection(
    snapshot.validation.commands,
    MAX_PROPOSAL_CONTEXT_VALIDATION_COMMANDS,
  );
  const gitBranch = boundProposalContextString(snapshot.git.branch);

  return Object.freeze({
    ...report,
    roadmap: {
      configuredPaths: configuredPaths.items,
      configuredPathsTotal: configuredPaths.total,
      configuredPathsTruncated: configuredPaths.truncated,
      stats: snapshot.roadmap.stats,
      summary: snapshot.roadmap.summary,
      selectedCandidate:
        snapshot.roadmap.selectedCandidate === null
          ? null
          : projectRoadmapProposalCandidate(snapshot.roadmap.selectedCandidate),
      candidates: proposalContext.candidates,
      phaseGates: proposalContext.phaseGates,
    },
    projectState: {
      git: {
        branch: gitBranch.value,
        branchTruncated: gitBranch.truncated,
        clean: snapshot.git.clean,
        requiresGit: snapshot.git.requiresGit,
      },
      validation: {
        commands: validationCommands.items,
        commandsTotal: validationCommands.total,
        commandsTruncated: validationCommands.truncated,
        configured: snapshot.validation.configured,
      },
      health: snapshot.health,
    },
    context: "available" as const,
  });
}

export type RoadmapProposalContextReport = ReturnType<
  typeof generateRoadmapProposalContextReport
>;

export async function generateRoadmapProposalReport(
  project: ProjectConfig,
  input: Readonly<{
    provider: TextOnlyProvider;
    providerAvailable: boolean;
    /** Explicit model for bounded/manual callers. Omit to auto-route from proposal context. */
    model?: string;
    effort?: AnthropicEffort;
    timeoutMs: number;
  }>,
) {
  const context = generateRoadmapProposalContextReport(project);
  const autoRouted = input.model === undefined;
  const routingDecision = autoRouted
    ? selectRoadmapProposalProfile(context)
    : null;
  const model = input.model ?? routingDecision!.model;
  const effort = autoRouted
    ? (routingDecision!.effort ?? undefined)
    : input.effort;

  const base = await generateRoadmapProposalFromContext(context, {
    provider: input.provider,
    providerAvailable: input.providerAvailable,
    model,
    timeoutMs: input.timeoutMs,
    ...(effort === undefined ? {} : { effort }),
  });

  const withProfile = autoRouted
    ? { ...base, profile: routingDecision!.profile }
    : base;

  if (withProfile.result.status === "unavailable") return withProfile;
  const { usage, model: resultModel } = withProfile.result;
  if (usage === undefined || resultModel === undefined) return withProfile;

  const pricing = resolveAnthropicPricing(resultModel);
  const actualCalculatedCostUsd =
    pricing === null
      ? undefined
      : calculateCostUsd(usage.inputTokens, usage.outputTokens, pricing);

  return {
    ...withProfile,
    result: {
      ...withProfile.result,
      ...(actualCalculatedCostUsd === undefined
        ? {}
        : {
            actualCalculatedCostUsd,
            pricingEffectiveDate: pricing!.effectiveFrom,
          }),
    },
  };
}

export type RoadmapDecisionStatus =
  | "existing_candidate"
  | "proposal"
  | "no_proposal"
  | "unavailable";

export type RoadmapDecisionReport = Readonly<{
  schemaVersion: 1;
  project: Readonly<{ name: string }>;
  decision: RoadmapDecisionStatus;
  reason: string;
  candidate?: ReturnType<typeof projectRoadmapProposalCandidate>;
  proposal?: Extract<RoadmapProposal, { status: "proposed" }>;
  providerCall?: Readonly<{
    requested: true;
    status: "unavailable" | "failed" | "completed";
    reason?: string;
    provider?: string;
    model?: string;
    effort?: AnthropicEffort | null;
    usage?: { inputTokens: number; outputTokens: number };
    actualCalculatedCostUsd?: number;
    /** Bounded provider failure classification; never raw provider diagnostics. */
    failureCode?: string;
  }>;
}>;

/**
 * Resolves the two branches that never require a provider call: an already
 * admissible roadmap candidate (preferred over generating anything new), or
 * an explicit unavailable/blocked reason (planning not eligible, objective
 * not configured, or a proposal exists to request but was not requested).
 * Returns `null` when the caller must decide whether to request a proposal.
 */
function resolveDeterministicRoadmapDecision(
  project: ProjectConfig,
): RoadmapDecisionReport | null {
  const snapshot = generateProjectReport(project);
  const projectName = { name: snapshot.project.name };

  if (snapshot.roadmap.selectedCandidate !== null) {
    return Object.freeze({
      schemaVersion: 1 as const,
      project: projectName,
      decision: "existing_candidate" as const,
      reason: "admissible_candidate_selected",
      candidate: projectRoadmapProposalCandidate(
        snapshot.roadmap.selectedCandidate,
      ),
    });
  }

  if (
    snapshot.planning.recommendation === "gated_no_work" ||
    !snapshot.objective.eligibleForRoadmapProposal
  ) {
    return Object.freeze({
      schemaVersion: 1 as const,
      project: projectName,
      decision: "unavailable" as const,
      reason: snapshot.planning.recommendation,
    });
  }

  return null;
}

/**
 * The single governed decision contract: existing_candidate | proposal |
 * no_proposal | unavailable. An admissible roadmap candidate is always
 * preferred and never triggers a provider call. When no candidate exists,
 * a provider call happens only when `requestProposal` is explicitly passed
 * (see PL1 doctrine — a decision must never hide an implicit paid call
 * behind a status/summary/next-shaped command); otherwise the decision is
 * `unavailable` with reason `proposal_requires_explicit_request`, since a
 * roadmap being empty or complete is never sufficient by itself to justify
 * proposing new work.
 */
export async function generateRoadmapDecisionReport(
  project: ProjectConfig,
  options: Readonly<{
    requestProposal?: Readonly<{
      provider: TextOnlyProvider;
      providerAvailable: boolean;
      model?: string;
      effort?: AnthropicEffort;
      timeoutMs: number;
    }>;
  }> = {},
): Promise<RoadmapDecisionReport> {
  const deterministic = resolveDeterministicRoadmapDecision(project);
  if (deterministic) return deterministic;

  const projectName = { name: project.name };

  if (options.requestProposal === undefined) {
    const snapshot = generateProjectReport(project);
    return Object.freeze({
      schemaVersion: 1 as const,
      project: projectName,
      decision: "unavailable" as const,
      reason: snapshot.planning.recommendation,
    });
  }

  const proposalReport = await generateRoadmapProposalReport(
    project,
    options.requestProposal,
  );
  const { result } = proposalReport;

  if (result.status !== "completed") {
    return Object.freeze({
      schemaVersion: 1 as const,
      project: projectName,
      decision: "unavailable" as const,
      reason: result.reason,
      providerCall: Object.freeze({
        requested: true as const,
        status: result.status,
        reason: result.reason,
        ...("provider" in result && result.provider !== undefined
          ? { provider: result.provider }
          : {}),
        ...("model" in result && result.model !== undefined
          ? { model: result.model }
          : {}),
        ...("providerFailure" in result && result.providerFailure !== undefined
          ? { failureCode: result.providerFailure.code }
          : {}),
      }),
    });
  }

  const proposal = proposalReport.proposal!;
  const actualCalculatedCostUsd = (
    result as { actualCalculatedCostUsd?: number }
  ).actualCalculatedCostUsd;
  const decision: RoadmapDecisionStatus =
    proposal.status === "proposed" ? "proposal" : "no_proposal";

  return Object.freeze({
    schemaVersion: 1 as const,
    project: projectName,
    decision,
    reason:
      proposal.status === "no_proposal"
        ? proposal.reason
        : "gap_demonstrated_against_canonical_objective",
    ...(proposal.status === "proposed" ? { proposal } : {}),
    providerCall: Object.freeze({
      requested: true as const,
      status: result.status,
      provider: result.provider,
      model: result.model,
      effort: result.effort,
      ...(result.usage ? { usage: result.usage } : {}),
      ...(actualCalculatedCostUsd === undefined
        ? {}
        : { actualCalculatedCostUsd }),
    }),
  });
}

export function generateRoadmapProposalEstimateReport(project: ProjectConfig) {
  const context = generateRoadmapProposalContextReport(project);
  if (context.context !== "available") {
    return {
      schemaVersion: 1 as const,
      project: { name: context.project.name },
      estimate: {
        status: "unavailable" as const,
        reason: context.objective.reason ?? "proposal_context_unavailable",
      },
    };
  }

  const routingDecision = selectRoadmapProposalProfile(context);
  const compact = buildCompactRoadmapProposalContext(context);
  const contextJson = compact === null ? "" : JSON.stringify(compact);
  const transmittedSchemaJson = JSON.stringify(
    toAnthropicOutputSchema(ROADMAP_PROPOSAL_OUTPUT_SCHEMA),
  );
  const estimatedInputTokens =
    estimateTokenCount(ROADMAP_PROPOSAL_SYSTEM_PROMPT) +
    estimateTokenCount(contextJson) +
    estimateTokenCount(transmittedSchemaJson) +
    ROADMAP_PROPOSAL_ESTIMATED_STRUCTURED_OUTPUT_OVERHEAD_TOKENS;
  const estimatedOutputTokens = ROADMAP_PROPOSAL_ESTIMATED_OUTPUT_TOKENS;
  const options = ROADMAP_PROPOSAL_PROFILES.map((profile) => {
    const resolved = resolveRoadmapProposalProfile(profile);
    const pricing = resolveAnthropicPricing(resolved.model);
    const estimatedCostUsd =
      pricing === null
        ? undefined
        : calculateCostUsd(
            estimatedInputTokens,
            estimatedOutputTokens,
            pricing,
          );
    return Object.freeze({
      profile,
      model: resolved.model,
      effort: resolved.effort,
      estimatedInputTokens,
      estimatedOutputTokens,
      ...(estimatedCostUsd === undefined
        ? {}
        : { estimatedCostUsd, pricingEffectiveDate: pricing!.effectiveFrom }),
    });
  });
  const recommended = options.find(
    (option) => option.profile === routingDecision.profile,
  )!;

  return {
    schemaVersion: 1 as const,
    project: { name: context.project.name },
    estimate: {
      status: "available" as const,
      ...recommended,
      reason: routingDecision.reason,
      options,
    },
  };
}

export async function generateGateReassessmentReport(
  project: ProjectConfig,
  input: Readonly<{
    provider: TextOnlyProvider;
    providerAvailable: boolean;
    model?: string;
    effort?: AnthropicEffort;
    timeoutMs: number;
  }>,
) {
  const context = generateRoadmapProposalContextReport(project, {
    allowIneligibleObjective: true,
  });
  const auto = input.model === undefined;
  const routing = auto ? selectRoadmapProposalProfile(context) : null;
  const base = await generateGateReassessmentFromContext(context, {
    ...input,
    model: input.model ?? routing!.model,
    ...(auto && routing!.effort !== null ? { effort: routing!.effort } : {}),
  });
  const report = auto ? { ...base, profile: routing!.profile } : base;
  if (
    report.result.status === "unavailable" ||
    report.result.usage === undefined ||
    report.result.model === undefined
  )
    return report;
  const pricing = resolveAnthropicPricing(report.result.model);
  return pricing === null
    ? report
    : {
        ...report,
        result: {
          ...report.result,
          actualCalculatedCostUsd: calculateCostUsd(
            report.result.usage.inputTokens,
            report.result.usage.outputTokens,
            pricing,
          ),
          pricingEffectiveDate: pricing.effectiveFrom,
        },
      };
}

export function generateGateReassessmentEstimateReport(project: ProjectConfig) {
  const context = generateRoadmapProposalContextReport(project, {
    allowIneligibleObjective: true,
  });
  const json = buildGateReassessmentContext(context);
  if (json === null)
    return {
      schemaVersion: 1 as const,
      project: { name: context.project.name },
      estimate: {
        status: "unavailable" as const,
        reason: "gate_reassessment_context_unavailable",
      },
    };
  const routing = selectRoadmapProposalProfile(context);
  const input =
    estimateTokenCount(GATE_REASSESSMENT_SYSTEM_PROMPT) +
    estimateTokenCount(json) +
    estimateTokenCount(
      JSON.stringify(toAnthropicOutputSchema(GATE_REASSESSMENT_OUTPUT_SCHEMA)),
    ) +
    GATE_REASSESSMENT_ESTIMATED_STRUCTURED_OUTPUT_OVERHEAD_TOKENS;
  const options = ROADMAP_PROPOSAL_PROFILES.map((profile) => {
    const resolved = resolveRoadmapProposalProfile(profile);
    const pricing = resolveAnthropicPricing(resolved.model);
    return Object.freeze({
      profile,
      model: resolved.model,
      effort: resolved.effort,
      estimatedInputTokens: input,
      estimatedOutputTokens: GATE_REASSESSMENT_ESTIMATED_OUTPUT_TOKENS,
      ...(pricing === null
        ? {}
        : {
            estimatedCostUsd: calculateCostUsd(
              input,
              GATE_REASSESSMENT_ESTIMATED_OUTPUT_TOKENS,
              pricing,
            ),
            pricingEffectiveDate: pricing.effectiveFrom,
          }),
    });
  });
  const recommended = options.find(
    (option) => option.profile === routing.profile,
  )!;
  return {
    schemaVersion: 1 as const,
    project: { name: context.project.name },
    estimate: {
      status: "available" as const,
      ...recommended,
      reason: routing.reason,
      options,
    },
  };
}

export function generateProjectContextReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: snapshot.project,
    workspace: snapshot.workspace,
    git: snapshot.git,
    planning: snapshot.planning,
    docs: snapshot.docs,
    roadmap: {
      available: snapshot.roadmap.available,
      paths: snapshot.roadmap.paths,
      selectedCandidate: snapshot.roadmap.selectedCandidate,
      phaseGates: snapshot.roadmap.phaseGates,
      stats: snapshot.roadmap.stats,
      summary: snapshot.roadmap.summary,
    },
    validation: snapshot.validation,
    health: snapshot.health,
  };
}

export function generateProjectHandoffReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: snapshot.project,
    workspace: snapshot.workspace,
    git: snapshot.git,
    planning: snapshot.planning,
    objective: snapshot.objective,
    roadmap: {
      available: snapshot.roadmap.available,
      paths: snapshot.roadmap.paths,
      selectedCandidate: snapshot.roadmap.selectedCandidate,
      selectedLotDetail: resolveSelectedLotDetail(
        snapshot.project.path,
        snapshot.roadmap.selectedCandidate,
      ),
      phaseGates: snapshot.roadmap.phaseGates,
      summary: snapshot.roadmap.summary,
      stats: snapshot.roadmap.stats,
    },
    validation: snapshot.validation,
    health: snapshot.health,
    instructions: [
      "Use this handoff as context for a human-supervised assistant session.",
      "Do not start implementation without explicit human confirmation.",
    ],
  };
}

export function generateNextProjectActionReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: snapshot.project,
    workspace: snapshot.workspace,
    git: snapshot.git,
    roadmap: {
      available: snapshot.roadmap.available,
      paths: snapshot.roadmap.paths,
      selectedCandidate: snapshot.roadmap.selectedCandidate,
      phaseGates: snapshot.roadmap.phaseGates,
      stats: snapshot.roadmap.stats,
      summary: snapshot.roadmap.summary,
    },
    validation: snapshot.validation,
    health: snapshot.health,
  };
}

export function generateProjectPromptReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  return {
    schemaVersion: 1 as const,
    project: snapshot.project,
    workspace: snapshot.workspace,
    git: snapshot.git,
    docs: snapshot.docs,
    roadmap: {
      available: snapshot.roadmap.available,
      paths: snapshot.roadmap.paths,
      selectedCandidate: snapshot.roadmap.selectedCandidate,
      stats: snapshot.roadmap.stats,
      summary: snapshot.roadmap.summary,
    },
    validation: snapshot.validation,
    instructions: [
      "Lire les sources listées avant toute intervention significative.",
      "Respecter l'architecture et les conventions du projet.",
      "Travailler par micro-lots sûrs et réversibles.",
      "Ne pas modifier de fichiers hors périmètre sans justification explicite.",
      "Ne pas ajouter de dépendance inutile.",
      "Lancer les validations configurées avant review ou commit.",
    ],
  };
}

function run(command: string, cwd: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 20,
    }).trim();
  } catch (error) {
    return error instanceof Error ? error.message : "Command failed.";
  }
}

export function generateReviewReport(project: ProjectConfig) {
  const snapshot = generateProjectReport(project);
  const diffNameOnly = snapshot.git.requiresGit
    ? run("git diff --name-only", snapshot.project.path)
    : "";
  const gitStatus = snapshot.git.requiresGit
    ? run("git status --short", snapshot.project.path)
    : "";
  const changedPaths = mergeChangedPaths(
    changedPathsFromGitDiff(diffNameOnly),
    untrackedPathsFromGitStatus(gitStatus),
  );

  return {
    schemaVersion: 1 as const,
    project: snapshot.project,
    git: snapshot.git,
    gitStatus,
    diffStat: snapshot.git.requiresGit
      ? run("git diff --stat", snapshot.project.path)
      : "",
    diff: snapshot.git.requiresGit
      ? run("git diff", snapshot.project.path)
      : "",
    documentationImpact: createDocumentationImpactReport(changedPaths),
    validation: snapshot.validation,
    health: snapshot.health,
  };
}

export type DoctorProjectReport = Readonly<{
  project: ProjectConfig;
  path: string;
  exists: boolean;
  isGitRepository: boolean;
  missingRequiredDocs: readonly string[];
}>;

export function generateDoctorReport(config: Config) {
  const projects: DoctorProjectReport[] = config.projects.map((project) => {
    const path = resolve(project.path);
    const exists = existsSync(path);
    return {
      project,
      path,
      exists,
      isGitRepository: isGitRepository(path),
      missingRequiredDocs: exists
        ? project.required_docs.filter((doc) => !docExists(path, doc))
        : project.required_docs,
    };
  });

  return {
    projects,
    hasError: projects.some(
      ({ project, exists, isGitRepository: git, missingRequiredDocs }) =>
        !exists ||
        (project.requires_git !== false && !git) ||
        (project.optional !== true && missingRequiredDocs.length > 0),
    ),
  };
}

/** Runs configured validation commands in declaration order without formatting output. */
export async function runConfiguredValidations(
  project: ProjectConfig,
  runCommand: (command: string, cwd: string) => Promise<number>,
): Promise<{ failedCommand: string | null; exitCode: number }> {
  const projectPath = resolve(project.path);
  for (const command of project.validation) {
    const exitCode = await runCommand(command, projectPath);
    if (exitCode !== 0) {
      return { failedCommand: command, exitCode };
    }
  }
  return { failedCommand: null, exitCode: 0 };
}

export function generateProjectValidationReport(project: ProjectConfig) {
  return {
    projectPath: resolve(project.path),
    configured: project.validation.length > 0,
  };
}

const RAG_SOURCE_PATHS = [
  "README.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "docs/architecture",
  "docs/audits",
  "docs/roadmap",
  "docs/integrations",
  "docs/releases",
] as const;
const RAG_INDEX_PATH = ".loop-engine/rag-index.json";

type RagDocument = Readonly<{
  id: string;
  path: string;
  title: string;
  sectionTitle: string;
  headingLevel: number;
  content: string;
  contentHash: string;
}>;

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function collectMarkdownFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  const stat = statSync(path);
  if (stat.isFile()) return path.endsWith(".md") ? [path] : [];
  return readdirSync(path)
    .flatMap((entry) => collectMarkdownFiles(join(path, entry)))
    .sort();
}

function splitMarkdownSections(content: string) {
  const sections: {
    sectionTitle: string;
    headingLevel: number;
    content: string[];
  }[] = [];
  let current: {
    sectionTitle: string;
    headingLevel: number;
    content: string[];
  } | null = null;
  for (const line of content.split("\n")) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = {
        sectionTitle: heading[2]?.trim() || "Untitled section",
        headingLevel: heading[1]?.length || 1,
        content: [line],
      };
    } else {
      current ??= { sectionTitle: "Document", headingLevel: 0, content: [] };
      current.content.push(line);
    }
  }
  if (current) sections.push(current);
  return sections.map((section) => ({
    sectionTitle: section.sectionTitle,
    headingLevel: section.headingLevel,
    content: section.content.join("\n").trim(),
  }));
}

function buildRagDocuments(path: string): readonly RagDocument[] {
  const content = readFileSync(path, "utf8");
  const title =
    content
      .split("\n")
      .find((line) => line.startsWith("# "))
      ?.replace(/^#\s+/, "")
      .trim() || path;
  return splitMarkdownSections(content)
    .filter((section) => section.content.length > 0)
    .map((section, index) => ({
      id: hashContent(`${path}:${index}:${section.sectionTitle}`).slice(0, 12),
      path,
      title,
      sectionTitle: section.sectionTitle,
      headingLevel: section.headingLevel,
      content: section.content,
      contentHash: hashContent(section.content),
    }));
}

/**
 * Loop Engine's own repository root marker, reused from `loadConfig()`
 * (`src/core/config.ts`). The RAG index must only ever be written when the
 * current working directory is the Loop Engine repository itself -- never
 * inside an inspected project.
 */
const REPOSITORY_ROOT_MARKER = "projects.yaml";

function assertRunningFromRepositoryRoot(): void {
  if (!existsSync(REPOSITORY_ROOT_MARKER)) {
    throw new Error(
      `rag-index must be run from the Loop Engine repository root (missing ${REPOSITORY_ROOT_MARKER} in the current working directory).`,
    );
  }
}

/** Builds the local deterministic RAG index and returns its public metadata. */
export function generateRagIndex() {
  assertRunningFromRepositoryRoot();
  const documents = RAG_SOURCE_PATHS.flatMap((sourcePath) =>
    collectMarkdownFiles(sourcePath),
  ).flatMap((file) => buildRagDocuments(file));
  const report = {
    schemaVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    sources: RAG_SOURCE_PATHS,
    documents,
  };
  mkdirSync(".loop-engine", { recursive: true });
  const temporaryPath = `${RAG_INDEX_PATH}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(report) + "\n");
  renameSync(temporaryPath, RAG_INDEX_PATH);
  return report;
}

type RagIndex = Readonly<{
  schemaVersion: number;
  generatedAt?: string;
  documents: readonly RagDocument[];
}>;
export type RagSearchOptions = Readonly<{
  limit?: number;
  pathPrefix?: string;
}>;
export type RagSearchReport = Readonly<{
  schemaVersion: 1;
  query: string;
  pathPrefix?: string | null;
  /** Index build timestamp (`generatedAt` from the RAG index), when readable. Additive, optional. */
  generatedAt?: string;
  results: readonly Readonly<{
    path: string;
    title: string;
    sectionTitle: string | null;
    headingLevel: number | null;
    score: number;
    snippet: string;
  }>[];
  error?: "missing_query" | "missing_index";
}>;

/**
 * Reads and validates the local RAG index. Fails soft (returns `null`) on a
 * missing, unreadable, unparsable, or schema-mismatched index file, so
 * `generateRagSearchReport` can degrade to the existing `missing_index`
 * error without introducing a new error code or changing the contract.
 */
function readRagIndex(): RagIndex | null {
  if (!existsSync(RAG_INDEX_PATH)) return null;
  try {
    const parsed = JSON.parse(
      readFileSync(RAG_INDEX_PATH, "utf8"),
    ) as Partial<RagIndex>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.documents)) {
      return null;
    }
    return parsed as RagIndex;
  } catch {
    return null;
  }
}

function occurrences(content: string, query: string): number {
  const normalizedQuery = query.toLowerCase();
  return normalizedQuery.length === 0
    ? 0
    : content.toLowerCase().split(normalizedQuery).length - 1;
}

function ragSnippet(content: string, query: string): string {
  const index = content.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return "";
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + query.length + 80);
  return `${start > 0 ? "... " : ""}${content.slice(start, end).replace(/\s+/g, " ").trim()}${end < content.length ? " ..." : ""}`;
}

/** Searches the local deterministic RAG index without formatting terminal output. */
export function generateRagSearchReport(
  query: string | undefined,
  options: RagSearchOptions = {},
): RagSearchReport {
  if (!query || query.trim().length === 0)
    return {
      schemaVersion: 1,
      query: query ?? "",
      results: [],
      error: "missing_query",
    };
  const index = readRagIndex();
  if (index === null)
    return { schemaVersion: 1, query, results: [], error: "missing_index" };
  const normalizedQuery = query.trim();
  const documents = options.pathPrefix
    ? index.documents.filter((document) =>
        document.path.startsWith(options.pathPrefix ?? ""),
      )
    : index.documents;
  const limit = options.limit && options.limit > 0 ? options.limit : 5;
  return {
    schemaVersion: 1,
    query: normalizedQuery,
    pathPrefix: options.pathPrefix ?? null,
    ...(index.generatedAt === undefined
      ? {}
      : { generatedAt: index.generatedAt }),
    results: documents
      .map((document) => ({
        document,
        score:
          occurrences(document.title, normalizedQuery) * 3 +
          occurrences(document.path, normalizedQuery) * 2 +
          occurrences(document.content, normalizedQuery),
      }))
      .filter((result) => result.score > 0)
      .sort((left, right) =>
        right.score !== left.score
          ? right.score - left.score
          : left.document.path.localeCompare(right.document.path),
      )
      .slice(0, limit)
      .map((result) => ({
        path: result.document.path,
        title: result.document.title,
        sectionTitle: result.document.sectionTitle ?? null,
        headingLevel: result.document.headingLevel ?? null,
        score: result.score,
        snippet: ragSnippet(result.document.content, normalizedQuery),
      })),
  };
}

const RUN_HISTORY_READ_CHUNK_BYTES = 64 * 1024;

export type LoopRunHistoryReport = Readonly<{
  schemaVersion: 1;
  project: string;
  limit: number;
  /** Most recent first. Physical append order on disk is never reordered. */
  entries: readonly LoopRunResult[];
  /**
   * Lines skipped because they were invalid JSON, an unrecognized schema, or
   * scoped to a different project than the requested journal. Corruption is
   * never silently dropped: it is always surfaced through this count.
   */
  corruptedLines: number;
  error?: "invalid_project_identity";
}>;

function normalizeRunHistoryLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_RUN_HISTORY_LIMIT;
  }
  return Math.min(Math.trunc(limit), MAX_RUN_HISTORY_LIMIT);
}

function isKnownLoopRunHistoryEntry(
  value: unknown,
  expectedProject: string,
): value is LoopRunResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LoopRunResult>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.runId === "string" &&
    candidate.project === expectedProject &&
    typeof candidate.status === "string" &&
    (LOOP_RUN_STATUSES as readonly string[]).includes(candidate.status) &&
    typeof candidate.startedAt === "string" &&
    (candidate.completedAt === null ||
      typeof candidate.completedAt === "string")
  );
}

/**
 * Reads a bounded window of the most recent history entries without loading
 * the whole file into memory: the journal is scanned sequentially in
 * fixed-size chunks and only the last `limit` valid entries are ever held at
 * once, regardless of how large the on-disk journal has grown.
 */
function readBoundedRunHistoryEntries(
  filePath: string,
  limit: number,
  projectName: string,
): Readonly<{ entries: readonly LoopRunResult[]; corruptedLines: number }> {
  const fd = openSync(filePath, "r");
  const window: LoopRunResult[] = [];
  let corruptedLines = 0;
  let leftover = "";

  function processLine(rawLine: string): void {
    const line = rawLine.trim();
    if (line.length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      corruptedLines += 1;
      return;
    }
    if (!isKnownLoopRunHistoryEntry(parsed, projectName)) {
      corruptedLines += 1;
      return;
    }
    window.push(parsed);
    if (window.length > limit) window.shift();
  }

  try {
    const buffer = Buffer.alloc(RUN_HISTORY_READ_CHUNK_BYTES);
    let bytesRead: number;
    while (
      (bytesRead = readSync(
        fd,
        buffer,
        0,
        RUN_HISTORY_READ_CHUNK_BYTES,
        null,
      )) > 0
    ) {
      leftover += buffer.toString("utf8", 0, bytesRead);
      const lines = leftover.split("\n");
      leftover = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    }
    if (leftover.length > 0) processLine(leftover);
  } finally {
    closeSync(fd);
  }

  window.reverse();
  return Object.freeze({ entries: Object.freeze(window), corruptedLines });
}

/**
 * Bounded, deterministic, read-only view of a project's run history, most
 * recent entry first. A missing journal is not corruption: it means no run
 * has been recorded yet for that project, and is reported as an empty
 * history rather than an error. No retention/eviction is implemented on the
 * journal itself in this lot -- only this read path is bounded.
 */
export function generateRunHistoryReport(
  projectName: string,
  options: Readonly<{ limit?: number }> = {},
): LoopRunHistoryReport {
  const limit = normalizeRunHistoryLimit(options.limit);
  let filePath: string;
  try {
    filePath = resolveRunHistoryFilePath(projectName);
  } catch (error) {
    if (error instanceof InvalidRunHistoryProjectIdentityError) {
      return {
        schemaVersion: 1,
        project: projectName,
        limit,
        entries: [],
        corruptedLines: 0,
        error: "invalid_project_identity",
      };
    }
    throw error;
  }
  if (!existsSync(filePath)) {
    return {
      schemaVersion: 1,
      project: projectName,
      limit,
      entries: [],
      corruptedLines: 0,
    };
  }
  const { entries, corruptedLines } = readBoundedRunHistoryEntries(
    filePath,
    limit,
    projectName,
  );
  return {
    schemaVersion: 1,
    project: projectName,
    limit,
    entries,
    corruptedLines,
  };
}
