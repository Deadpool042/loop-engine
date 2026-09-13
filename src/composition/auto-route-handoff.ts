import { createAgentRegistry } from "../agents/registry.js";
import type { AgentEfficiencySignal } from "../agents/selector.js";
import {
  classifyRunScopeSize,
  estimateExpectedRunEfficiency,
  generateProjectHandoffReport,
  generateProjectReport,
  generateRunModelEfficiencyReport,
  type ProjectConfig,
} from "../core/index.js";
import { resolveSelectedLotWritablePaths } from "../core/selected-lot-detail.js";
import { DEFAULT_AGENT_POLICY } from "../policy/defaults.js";
import {
  applyQuotaReserve,
  normalizeOpenClawQuotaSnapshot,
  type OpenClawQuotaSnapshotResult,
} from "../policy/quota.js";
import { resolvePolicy } from "../policy/resolver.js";
import {
  buildAutoSubscriptionExecutionCandidates,
  decideAutoSubscriptionRoute,
  loadAutoSubscriptionModelPortfolioFromEnvironment,
  type AutoSubscriptionModelPortfolio,
} from "./auto-subscription-execution.js";

export const AUTO_QUOTA_SNAPSHOT_ENV = "LOOP_AUTO_QUOTA_SNAPSHOT_JSON";

export type AutoRouteHandoffProjection = Readonly<{
  status: "selected" | "unavailable";
  reason: string | null;
  decision: ReturnType<typeof decideAutoSubscriptionRoute>["selected"];
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

function parseQuotaSnapshot(
  environment: NodeJS.ProcessEnv,
): OpenClawQuotaSnapshotResult {
  const raw = environment[AUTO_QUOTA_SNAPSHOT_ENV];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { status: "unknown", reason: "invalid_snapshot" };
  }
  try {
    return normalizeOpenClawQuotaSnapshot(JSON.parse(raw));
  } catch {
    return { status: "unknown", reason: "invalid_snapshot" };
  }
}

function runtimeQuotaEvidence(
  provider: string,
  quota: OpenClawQuotaSnapshotResult,
): Readonly<{ state: "available" | "exhausted" | "unknown"; source: "runtime_report" | "unavailable" }> {
  if (quota.status !== "available") {
    return Object.freeze({ state: "unknown", source: "unavailable" });
  }
  const providerQuota = quota.snapshot.providers.find(
    (entry) => entry.provider === provider,
  );
  const window = providerQuota?.constrainingWindow ?? null;
  if (window === null) {
    return Object.freeze({ state: "unknown", source: "unavailable" });
  }
  const reserve = applyQuotaReserve(
    window.remainingPercent,
    DEFAULT_AGENT_POLICY.quotaReserve,
  );
  return Object.freeze({
    state: reserve.usablePercent > 0 ? "available" : "exhausted",
    source: "runtime_report",
  });
}

function withFreshRuntimeQuota(
  portfolio: AutoSubscriptionModelPortfolio,
  quota: OpenClawQuotaSnapshotResult,
): AutoSubscriptionModelPortfolio {
  const updateProfiles = <T extends Readonly<{ quota: unknown }>>(
    profiles: readonly T[] | undefined,
    provider: string | ((profile: T) => string),
  ): readonly T[] | undefined =>
    profiles?.map((profile) =>
      Object.freeze({
        ...profile,
        quota: runtimeQuotaEvidence(
          typeof provider === "function" ? provider(profile) : provider,
          quota,
        ),
      }),
    );

  return Object.freeze({
    ...(portfolio.codex === undefined
      ? {}
      : { codex: Object.freeze(updateProfiles(portfolio.codex, "openai")!) }),
    ...(portfolio.claude_code === undefined
      ? {}
      : { claude_code: Object.freeze(updateProfiles(portfolio.claude_code, "anthropic")!) }),
    ...(portfolio.openclaw === undefined
      ? {}
      : {
          openclaw: Object.freeze(
            updateProfiles(portfolio.openclaw, (profile) => profile.provider)!,
          ),
        }),
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

  const quota = parseQuotaSnapshot(environment);
  portfolio = withFreshRuntimeQuota(portfolio, quota);

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

  const selectedLotDetail = generateProjectHandoffReport(project).roadmap.selectedLotDetail;
  const writablePaths =
    selectedLotDetail === null
      ? null
      : resolveSelectedLotWritablePaths(selectedLotDetail, selectedLotDetail.path);
  const scopeSize =
    writablePaths === null ? null : classifyRunScopeSize(writablePaths.length);
  const history = generateRunModelEfficiencyReport(project.name, { limit: 20 });

  const signals: AgentEfficiencySignal[] = candidates.map((entry) => {
    if (scopeSize === null) {
      return Object.freeze({
        profileId: entry.profile.id,
        status: "unknown" as const,
        reason: "scope_size_unavailable",
      });
    }
    if (quota.status !== "available") {
      return Object.freeze({
        profileId: entry.profile.id,
        status: "unknown" as const,
        reason: `quota_${quota.reason}`,
      });
    }
    const providerQuota = quota.snapshot.providers.find(
      (provider) => provider.provider === entry.profile.provider,
    );
    const window = providerQuota?.constrainingWindow ?? null;
    if (window === null) {
      return Object.freeze({
        profileId: entry.profile.id,
        status: "unknown" as const,
        reason: "quota_window_unavailable",
      });
    }

    const estimate = estimateExpectedRunEfficiency(history.observations, {
      provider: entry.profile.provider,
      model: entry.profile.model,
      effort: policy.requirements.minimumEffort,
      taskCategory: policy.requirements.category,
      scopeSize,
      quotaWindowLabel: window.label,
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
      quotaWindowLabel: estimate.quotaWindowLabel,
      expectedValuePercent: estimate.expectedValuePercent,
      expectedQuotaConsumedPercent: estimate.expectedQuotaConsumedPercent,
      sampleSize: estimate.sampleSize,
    });
  });

  const route = decideAutoSubscriptionRoute(portfolio, policy, signals);
  if (route.outcome !== "selected" || route.selected === null) {
    return Object.freeze({
      status: "unavailable" as const,
      reason: "no_executable_route",
      decision: null,
      notSelected: route.notSelected,
      quotaBefore: Object.freeze({
        status: "unknown" as const,
        reason: quota.status === "available" ? "no_selected_route" : `quota_${quota.reason}`,
      }),
      estimatedImpact: Object.freeze({
        status: "unknown" as const,
        reason: "no_selected_route",
      }),
    });
  }

  let quotaBefore: AutoRouteHandoffProjection["quotaBefore"] = Object.freeze({
    status: "unknown" as const,
    reason: quota.status === "available" ? "selected_provider_quota_unavailable" : `quota_${quota.reason}`,
  });
  let estimatedImpact: AutoRouteHandoffProjection["estimatedImpact"] = Object.freeze({
    status: "unknown" as const,
    reason: "insufficient_run_history_or_quota",
  });

  if (quota.status === "available") {
    const providerQuota = quota.snapshot.providers.find(
      (provider) => provider.provider === route.selected!.provider,
    );
    const window = providerQuota?.constrainingWindow ?? null;
    if (providerQuota && window) {
      const reserve = applyQuotaReserve(
        window.remainingPercent,
        DEFAULT_AGENT_POLICY.quotaReserve,
      );
      quotaBefore = Object.freeze({
        status: "available" as const,
        provider: providerQuota.provider,
        plan: providerQuota.plan,
        updatedAt: quota.snapshot.updatedAt,
        ageMs: quota.snapshot.ageMs,
        window: Object.freeze({
          label: window.label,
          usedPercent: window.usedPercent,
          remainingPercent: window.remainingPercent,
          resetAt: window.resetAt,
          usablePercent: reserve.usablePercent,
          reservePercent: reserve.reserve.totalPercent,
        }),
      });

      if (
        route.selected.expectedQuotaConsumedPercent !== null &&
        route.selected.expectedValuePercent !== null &&
        route.selected.sampleSize !== null &&
        route.selected.quotaWindowLabel === window.label
      ) {
        const remainingAfterPercent = Math.max(
          0,
          window.remainingPercent - route.selected.expectedQuotaConsumedPercent,
        );
        const afterReserve = applyQuotaReserve(
          remainingAfterPercent,
          DEFAULT_AGENT_POLICY.quotaReserve,
        );
        estimatedImpact = Object.freeze({
          status: "available" as const,
          quotaWindowLabel: window.label,
          expectedQuotaConsumedPercent:
            route.selected.expectedQuotaConsumedPercent,
          expectedValuePercent: route.selected.expectedValuePercent,
          sampleSize: route.selected.sampleSize,
          remainingAfterPercent,
          usableAfterReservePercent: afterReserve.usablePercent,
        });
      }
    }
  }

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
