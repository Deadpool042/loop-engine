import {
  LOOP_RUN_MODES,
  findProject,
  generateAuditReport,
  generateAuditRuleManifest,
  generateDoctorReport,
  generateExecutionReportWithEvidence,
  generateNextProjectActionReport,
  generateProjectContextReport,
  generateProjectHandoffReport,
  generateProjectObjectiveReport,
  generateProjectPromptReport,
  generateProjectReport,
  generateRoadmapPlanningStatusReport,
  generateRoadmapProposalContextReport,
  generateRoadmapProposalEstimateReport,
  generateRoadmapProposalReport,
  generateProjectValidationReport,
  generateRagIndex,
  generateRagSearchReport,
  generateReviewReport,
  generateWorkspaceReports,
  generateWorkspaceSummaryReport,
  getRequiredProjectName,
  isAuditProfile,
  isAuditRuleStability,
  isAuditRuleTag,
  loadConfig,
  runConfiguredValidations,
  runLoopCommit,
  runLoopExecuteWithProviderFailoverEvidence,
  runLoopPlan,
  type AuditProfile,
  type AuditReport,
  type AuditRuleSelection,
  type LoopExecutor,
} from "../core/index.js";
import type { AgentRegistry } from "../agents/registry.js";
import {
  createAnthropicApiProvider,
  hasAnthropicApiCredential,
  type AnthropicEffort,
  type TextOnlyProvider,
} from "../text-only-provider/index.js";
import { createLoopProviderFailoverAssembly } from "./provider-failover-assembly.js";
import {
  createIsolatedProviderRunExecute,
  type IsolatedProviderExecutionOptions,
} from "./isolated-provider-execution.js";
import {
  assembleLoopProvider,
  assembleLoopProviders,
  defaultLoopProviderRegistry,
  type ClaudeCodeProviderConfiguration,
  type CodexProviderConfiguration,
  type LoopProviderAssembly,
  type LoopProviderConfiguration,
  type LoopProviderId,
  type LoopProviderRegistry,
} from "./provider-registry.js";

export type LoopApplicationCodexProviderOptions = Omit<
  CodexProviderConfiguration,
  "id"
>;
export type LoopApplicationClaudeCodeProviderOptions = Omit<
  ClaudeCodeProviderConfiguration,
  "id"
>;

export type LoopApplicationAssemblyOptions = Readonly<{
  provider?: LoopProviderConfiguration;
  providers?: readonly LoopProviderConfiguration[];
  providerRegistry?: LoopProviderRegistry;
  providerAssemblies?: readonly LoopProviderAssembly[];
  maxProviderAttempts?: number;
  textOnlyProvider?: TextOnlyProvider;
  textOnlyProviderCredentialAvailable?: () => boolean;
  /** @deprecated Prefer provider: { id: "codex", ... }. */
  codexProvider?: LoopApplicationCodexProviderOptions;
  /** @deprecated Prefer provider: { id: "claude_code", ... }. */
  claudeCodeProvider?: LoopApplicationClaudeCodeProviderOptions;
  isolatedProviderExecution?: Omit<
    IsolatedProviderExecutionOptions,
    "executor" | "agentRegistry" | "resolveRepositoryPath"
  > & {
    resolveRepositoryPath?: (projectId: string) => string;
  };
}>;

export type LoopApplicationAssembly = Readonly<{
  findProject: typeof findProject;
  generateAuditReport: typeof generateAuditReport;
  generateAuditRuleManifest: typeof generateAuditRuleManifest;
  generateDoctorReport: typeof generateDoctorReport;
  generateExecutionReport: typeof generateExecutionReportWithEvidence;
  generateNextProjectActionReport: typeof generateNextProjectActionReport;
  generateProjectContextReport: typeof generateProjectContextReport;
  generateProjectHandoffReport: typeof generateProjectHandoffReport;
  generateProjectObjectiveReport: typeof generateProjectObjectiveReport;
  generateProjectPromptReport: typeof generateProjectPromptReport;
  generateProjectReport: typeof generateProjectReport;
  generateRoadmapPlanningStatusReport: typeof generateRoadmapPlanningStatusReport;
  generateRoadmapProposalContextReport: typeof generateRoadmapProposalContextReport;
  generateRoadmapProposalReport: (
    project: LoopApplicationProject,
    input: Readonly<{
      model?: string;
      effort?: AnthropicEffort;
      timeoutMs: number;
    }>,
  ) => ReturnType<typeof generateRoadmapProposalReport>;
  generateRoadmapProposalEstimateReport: typeof generateRoadmapProposalEstimateReport;
  generateProjectValidationReport: typeof generateProjectValidationReport;
  generateRagIndex: typeof generateRagIndex;
  generateRagSearchReport: typeof generateRagSearchReport;
  generateReviewReport: typeof generateReviewReport;
  generateWorkspaceReports: typeof generateWorkspaceReports;
  generateWorkspaceSummaryReport: typeof generateWorkspaceSummaryReport;
  getRequiredProjectName: typeof getRequiredProjectName;
  isAuditProfile: typeof isAuditProfile;
  isAuditRuleStability: typeof isAuditRuleStability;
  isAuditRuleTag: typeof isAuditRuleTag;
  loadConfig: typeof loadConfig;
  loopAgentRegistry?: AgentRegistry;
  loopExecutor?: LoopExecutor;
  loopProviderId?: LoopProviderId;
  loopProviderIds?: readonly LoopProviderId[];
  loopProviderMaxAttempts?: number;
  loopRunModes: typeof LOOP_RUN_MODES;
  runConfiguredValidations: typeof runConfiguredValidations;
  runLoopCommit: typeof runLoopCommit;
  runLoopExecute: typeof runLoopExecuteWithProviderFailoverEvidence;
  runLoopPlan: typeof runLoopPlan;
}>;

export type LoopApplicationConfig = ReturnType<
  LoopApplicationAssembly["loadConfig"]
>;
export type LoopApplicationProject = LoopApplicationConfig["projects"][number];
export type LoopApplicationRunMode =
  LoopApplicationAssembly["loopRunModes"][number];
export type LoopApplicationAuditProfile = AuditProfile;
export type LoopApplicationAuditSelection = AuditRuleSelection;
export type LoopApplicationAuditReport = AuditReport;

function resolveLegacyProvider(
  options: LoopApplicationAssemblyOptions,
): LoopProviderConfiguration | undefined {
  const legacyCount =
    Number(options.codexProvider !== undefined) +
    Number(options.claudeCodeProvider !== undefined);
  if (legacyCount > 1) {
    throw new Error("Configure only one legacy provider option.");
  }
  if (options.codexProvider)
    return Object.freeze({ id: "codex", ...options.codexProvider });
  if (options.claudeCodeProvider) {
    return Object.freeze({ id: "claude_code", ...options.claudeCodeProvider });
  }
  return undefined;
}

function resolveProviderAssemblies(
  options: LoopApplicationAssemblyOptions,
): readonly LoopProviderAssembly[] {
  const legacyProvider = resolveLegacyProvider(options);
  const configuredModes = [
    options.provider !== undefined,
    options.providers !== undefined,
    options.providerAssemblies !== undefined,
    legacyProvider !== undefined,
  ].filter(Boolean).length;
  if (configuredModes > 1) {
    throw new Error(
      "Configure exactly one of provider, providers, providerAssemblies, or a legacy provider option.",
    );
  }
  if (options.providerAssemblies)
    return Object.freeze([...options.providerAssemblies]);
  const registry = options.providerRegistry ?? defaultLoopProviderRegistry;
  if (options.providers)
    return assembleLoopProviders(registry, options.providers);
  const single = options.provider ?? legacyProvider;
  return single
    ? Object.freeze([assembleLoopProvider(registry, single)])
    : Object.freeze([]);
}

export function createLoopApplicationAssembly(
  options: LoopApplicationAssemblyOptions = {},
): LoopApplicationAssembly {
  const providerAssemblies = resolveProviderAssemblies(options);
  const providerDependency =
    providerAssemblies.length === 0
      ? undefined
      : createLoopProviderFailoverAssembly(
          providerAssemblies,
          options.maxProviderAttempts ?? providerAssemblies.length,
        );
  const isolatedRunExecute =
    providerDependency === undefined
      ? undefined
      : createIsolatedProviderRunExecute({
          executor: providerDependency.executor,
          agentRegistry: providerDependency.agentRegistry,
          resolveRepositoryPath:
            options.isolatedProviderExecution?.resolveRepositoryPath ??
            ((projectId) => {
              const project = findProject(loadConfig(), projectId);
              if (!project) {
                throw new Error(
                  `Unknown project for isolated execution: ${projectId}`,
                );
              }
              return project.path;
            }),
          ...(options.isolatedProviderExecution ?? {}),
        });

  const textOnlyProvider =
    options.textOnlyProvider ?? createAnthropicApiProvider();
  const textOnlyProviderCredentialAvailable =
    options.textOnlyProviderCredentialAvailable ??
    (() => hasAnthropicApiCredential());

  return Object.freeze({
    findProject,
    generateAuditReport,
    generateAuditRuleManifest,
    generateDoctorReport,
    generateExecutionReport: generateExecutionReportWithEvidence,
    generateNextProjectActionReport,
    generateProjectContextReport,
    generateProjectHandoffReport,
    generateProjectObjectiveReport,
    generateProjectPromptReport,
    generateProjectReport,
    generateRoadmapPlanningStatusReport,
    generateRoadmapProposalContextReport,
    generateRoadmapProposalEstimateReport,
    generateRoadmapProposalReport: (project, input) =>
      generateRoadmapProposalReport(project, {
        provider: textOnlyProvider,
        providerAvailable: textOnlyProviderCredentialAvailable(),
        ...input,
      }),
    generateProjectValidationReport,
    generateRagIndex,
    generateRagSearchReport,
    generateReviewReport,
    generateWorkspaceReports,
    generateWorkspaceSummaryReport,
    getRequiredProjectName,
    isAuditProfile,
    isAuditRuleStability,
    isAuditRuleTag,
    loadConfig,
    ...(providerDependency === undefined
      ? {}
      : {
          loopAgentRegistry: providerDependency.agentRegistry,
          loopExecutor: providerDependency.executor,
          loopProviderId: providerDependency.providerIds[0] as LoopProviderId,
          loopProviderIds:
            providerDependency.providerIds as readonly LoopProviderId[],
          loopProviderMaxAttempts: providerDependency.maxAttempts,
        }),
    loopRunModes: LOOP_RUN_MODES,
    runConfiguredValidations,
    runLoopCommit,
    runLoopExecute:
      isolatedRunExecute ?? runLoopExecuteWithProviderFailoverEvidence,
    runLoopPlan,
  });
}
