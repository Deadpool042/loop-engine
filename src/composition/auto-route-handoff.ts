import { createAgentRegistry } from "../agents/registry.js";
import type { AgentRouteDecision } from "../agents/router.js";
import type {
  AgentEfficiencySignal,
  AgentPerformanceSignal,
} from "../agents/selector.js";
import {
  classifyRunScopeSize,
  estimateExpectedRunPerformance,
  generateProjectHandoffReport,
  generateProjectReport,
  generateRunModelEfficiencyReport,
  type ProjectConfig,
} from "../core/index.js";
import { resolveSelectedLotWritablePaths } from "../core/selected-lot-detail.js";
import { DEFAULT_AGENT_POLICY } from "../policy/defaults.js";
import { resolvePolicy } from "../policy/resolver.js";
import type { AgentPolicyResolution } from "../policy/types.js";
import {
  buildAutoSubscriptionExecutionCandidates,
  decideAutoSubscriptionRoute,
  loadAutoSubscriptionModelPortfolioFromEnvironment,
  type AutoSubscriptionModelPortfolio,
} from "./auto-subscription-execution.js";

export type ChatGptHandoffDecision = Readonly<{
  profileId: "interactive.chatgpt";
  runtime: "chatgpt";
  provider: "openai";
  model: null;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  executionPath: "chatgpt_handoff";
  basis: "governed_interactive_category" | "no_safe_autonomous_route";
  efficiencyScore: null;
  quotaWindowLabel: null;
  expectedValuePercent: null;
  expectedQuotaConsumedPercent: null;
  sampleSize: null;
}>;

export type AutoRouteHandoffProjection = Readonly<{
  status: "selected" | "unavailable";
  reason: string | null;
  decision:
    | ReturnType<typeof decideAutoSubscriptionRoute>["selected"]
    | ChatGptHandoffDecision;
  notSelected: ReturnType<typeof decideAutoSubscriptionRoute>["notSelected"];
  quotaBefore:
    | Readonly<{
        status: "available";
        provider: string;
        plan: string | null;
        updatedAt: number;
        ageMs: number;
        window: Readonly<{
          label: string;
          usedPercent: number;
          remainingPercent: number;
          resetAt: number;
          usablePercent: number;
          reservePercent: number;
        }>;
      }>
    | Readonly<{ status: "unknown"; reason: string }>;
  estimatedImpact:
    | Readonly<{
        status: "available";
        quotaWindowLabel: string;
        expectedQuotaConsumedPercent: number;
        expectedValuePercent: number;
        sampleSize: number;
        remainingAfterPercent: number;
        usableAfterReservePercent: number;
      }>
    | Readonly<{ status: "unknown"; reason: string }>;
}>;

function chatGptHandoffDecision(
  effort: ChatGptHandoffDecision["effort"],
  basis: ChatGptHandoffDecision["basis"],
): ChatGptHandoffDecision {
  return Object.freeze({
    profileId: "interactive.chatgpt" as const,
    runtime: "chatgpt" as const,
    provider: "openai" as const,
    model: null,
    effort,
    executionPath: "chatgpt_handoff" as const,
    basis,
    efficiencyScore: null,
    quotaWindowLabel: null,
    expectedValuePercent: null,
    expectedQuotaConsumedPercent: null,
    sampleSize: null,
  });
}

export function decideAutoContinuationRoute(
  policy: AgentPolicyResolution,
  autonomousRoute: AgentRouteDecision,
): AgentRouteDecision["selected"] | ChatGptHandoffDecision | null {
  if (policy.status !== "resolved") return null;

  if (
    policy.requirements.category === "review" ||
    policy.requirements.category === "architecture"
  ) {
    return chatGptHandoffDecision(
      policy.requirements.minimumEffort,
      "governed_interactive_category",
    );
  }

  if (
    autonomousRoute.outcome === "selected" &&
    autonomousRoute.selected !== null
  ) {
    return autonomousRoute.selected;
  }

  return chatGptHandoffDecision(
    policy.requirements.minimumEffort,
    "no_safe_autonomous_route",
  );
}

function unknownProjection(reason: string): AutoRouteHandoffProjection {
  return Object.freeze({
    status: "unavailable" as const,
    reason,
    decision: null,
    notSelected: Object.freeze([]),
    quotaBefore: Object.freeze({
      status: "unknown" as const,
      reason,
    }),
    estimatedImpact: Object.freeze({
      status: "unknown" as const,
      reason,
    }),
  });
}

// The native usage-status snapshot that fed runtime quota evidence belonged to
// the retired OpenClaw runtime. Until another governed source exists, quota is
// unknown for every profile, which keeps AUTO routing fail-closed.
const QUOTA_UNAVAILABLE_REASON = "quota_snapshot_source_retired";

function withUnavailableRuntimeQuota(
  portfolio: AutoSubscriptionModelPortfolio,
): AutoSubscriptionModelPortfolio {
  const markUnavailable = <T extends Readonly<{ quota: unknown }>>(
    profiles: readonly T[] | undefined,
  ): readonly T[] | undefined =>
    profiles?.map((profile) =>
      Object.freeze({
        ...profile,
        quota: Object.freeze({ state: "unknown", source: "unavailable" }),
      }),
    );

  return Object.freeze({
    ...(portfolio.codex === undefined
      ? {}
      : { codex: Object.freeze(markUnavailable(portfolio.codex)!) }),
    ...(portfolio.copilot === undefined
      ? {}
      : { copilot: Object.freeze(markUnavailable(portfolio.copilot)!) }),
    ...(portfolio.claude_code === undefined
      ? {}
      : { claude_code: Object.freeze(markUnavailable(portfolio.claude_code)!) }),
  });
}

export function generateAutoRouteHandoffProjection(
  project: ProjectConfig,
  environment: NodeJS.ProcessEnv = process.env,
): AutoRouteHandoffProjection {
  const snapshot = generateProjectReport(project);
  const candidate = snapshot.roadmap.selectedCandidate;
  if (candidate === null) return unknownProjection("no_selected_candidate");

  let portfolio;
  try {
    portfolio = loadAutoSubscriptionModelPortfolioFromEnvironment(environment);
  } catch {
    return unknownProjection("auto_portfolio_unavailable");
  }

  portfolio = withUnavailableRuntimeQuota(portfolio);

  const candidates = buildAutoSubscriptionExecutionCandidates(portfolio);
  if (candidates.length === 0) return unknownProjection("auto_portfolio_empty");

  const policy = resolvePolicy({
    policy: DEFAULT_AGENT_POLICY,
    registry: createAgentRegistry(candidates.map((entry) => entry.profile)),
    candidate,
    mode: "execute",
  });
  if (policy.status !== "resolved") {
    return unknownProjection(`policy_${policy.status}`);
  }

  // Review/architecture are intentionally interactive. For every other
  // category, evaluate the autonomous candidates first; otherwise feeding a
  // synthetic no-match here would turn the ChatGPT fallback into an early
  // return and make every executable lot interactive by construction.
  if (
    policy.requirements.category === "review" ||
    policy.requirements.category === "architecture"
  ) {
    const interactiveDecision = decideAutoContinuationRoute(
      policy,
      Object.freeze({
        outcome: "no_match" as const,
        selected: null,
        notSelected: Object.freeze([]),
      }),
    );
    if (interactiveDecision?.executionPath === "chatgpt_handoff") {
      return Object.freeze({
        status: "selected" as const,
        reason: null,
        decision: interactiveDecision,
        notSelected: Object.freeze([]),
        quotaBefore: Object.freeze({
          status: "unknown" as const,
          reason: "chatgpt_interactive_quota_not_modeled",
        }),
        estimatedImpact: Object.freeze({
          status: "unknown" as const,
          reason: "chatgpt_interactive_quota_not_modeled",
        }),
      });
    }
  }

  const selectedLotDetail = generateProjectHandoffReport(project).roadmap.selectedLotDetail;
  const writablePaths =
    selectedLotDetail === null
      ? null
      : resolveSelectedLotWritablePaths(selectedLotDetail, selectedLotDetail.path);
  const scopeSize =
    writablePaths === null ? null : classifyRunScopeSize(writablePaths.length);
  const history = generateRunModelEfficiencyReport(project.name, { limit: 20 });

  const signals: AgentEfficiencySignal[] = candidates.map((entry) =>
    Object.freeze({
      profileId: entry.profile.id,
      status: "unknown" as const,
      reason: scopeSize === null ? "scope_size_unavailable" : QUOTA_UNAVAILABLE_REASON,
    }),
  );

  const performanceSignals: AgentPerformanceSignal[] = candidates.map((entry) => {
    if (scopeSize === null) {
      return Object.freeze({
        profileId: entry.profile.id,
        status: "unknown" as const,
        reason: "scope_size_unavailable",
      });
    }
    const estimate = estimateExpectedRunPerformance(history.observations, {
      provider: entry.profile.provider,
      runtime: entry.profile.runtime,
      model: entry.profile.model,
      effort: policy.requirements.minimumEffort,
      taskCategory: policy.requirements.category,
      scopeSize,
    });
    if (estimate.status !== "available") {
      return Object.freeze({
        profileId: entry.profile.id,
        status: "unknown" as const,
        reason: estimate.reason,
      });
    }
    return Object.freeze({
      profileId: entry.profile.id,
      status: "available" as const,
      terminalSuccessPercent: estimate.terminalSuccessPercent,
      firstPassValidationPercent: estimate.firstPassValidationPercent,
      medianDurationMs: estimate.medianDurationMs,
      meanRepairAttempts: estimate.meanRepairAttempts,
      scopeViolationPercent: estimate.scopeViolationPercent,
      failoverPercent: estimate.failoverPercent,
      sampleSize: estimate.matchingRuns,
    });
  });

  const route = decideAutoSubscriptionRoute(
    portfolio,
    policy,
    signals,
    performanceSignals,
  );
  const continuationDecision = decideAutoContinuationRoute(policy, route);
  if (continuationDecision?.executionPath === "chatgpt_handoff") {
    return Object.freeze({
      status: "selected" as const,
      reason: null,
      decision: continuationDecision,
      notSelected: route.notSelected,
      quotaBefore: Object.freeze({
        status: "unknown" as const,
        reason: "chatgpt_interactive_quota_not_modeled",
      }),
      estimatedImpact: Object.freeze({
        status: "unknown" as const,
        reason: "chatgpt_interactive_quota_not_modeled",
      }),
    });
  }
  if (route.outcome !== "selected" || route.selected === null) {
    return unknownProjection("no_safe_continuation_route");
  }

  const quotaBefore: AutoRouteHandoffProjection["quotaBefore"] = Object.freeze({
    status: "unknown" as const,
    reason: QUOTA_UNAVAILABLE_REASON,
  });
  const estimatedImpact: AutoRouteHandoffProjection["estimatedImpact"] =
    Object.freeze({
      status: "unknown" as const,
      reason: "insufficient_run_history_or_quota",
    });

  return Object.freeze({
    status: "selected" as const,
    reason: null,
    decision: route.selected,
    notSelected: route.notSelected,
    quotaBefore,
    estimatedImpact,
  });
}

export function generateProjectHandoffReportWithAutoRoute(
  project: ProjectConfig,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const base = generateProjectHandoffReport(project);
  return Object.freeze({
    ...base,
    autoRoute: generateAutoRouteHandoffProjection(project, environment),
  });
}
