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
  generateProjectPromptReport,
  generateProjectReport,
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
  runLoopExecute,
  runLoopPlan,
  type AuditProfile,
  type AuditReport,
  type AuditRuleSelection,
  type LoopExecutor,
} from "../core/index.js";
import type { AgentRegistry } from "../agents/registry.js";
import { createLoopProviderFailoverAssembly } from "./provider-failover-assembly.js";
import {
  assembleLoopProvider,
  defaultLoopProviderRegistry,
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

export type LoopApplicationAssemblyOptions = Readonly<{
  provider?: LoopProviderConfiguration;
  providerRegistry?: LoopProviderRegistry;
  providerAssemblies?: readonly LoopProviderAssembly[];
  maxProviderAttempts?: number;
  /** @deprecated Prefer provider: { id: "codex", ... }. */
  codexProvider?: LoopApplicationCodexProviderOptions;
}>;

/** Public application boundary consumed by the CLI command layer. */
export type LoopApplicationAssembly = Readonly<{
  findProject: typeof findProject;
  generateAuditReport: typeof generateAuditReport;
  generateAuditRuleManifest: typeof generateAuditRuleManifest;
  generateDoctorReport: typeof generateDoctorReport;
  generateExecutionReport: typeof generateExecutionReportWithEvidence;
  generateNextProjectActionReport: typeof generateNextProjectActionReport;
  generateProjectContextReport: typeof generateProjectContextReport;
  generateProjectHandoffReport: typeof generateProjectHandoffReport;
  generateProjectPromptReport: typeof generateProjectPromptReport;
  generateProjectReport: typeof generateProjectReport;
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
  runLoopExecute: typeof runLoopExecute;
  runLoopPlan: typeof runLoopPlan;
}>;

export type LoopApplicationConfig = ReturnType<LoopApplicationAssembly["loadConfig"]>;
export type LoopApplicationProject = LoopApplicationConfig["projects"][number];
export type LoopApplicationRunMode = LoopApplicationAssembly["loopRunModes"][number];
export type LoopApplicationAuditProfile = AuditProfile;
export type LoopApplicationAuditSelection = AuditRuleSelection;
export type LoopApplicationAuditReport = AuditReport;

function resolveProviderConfiguration(
  options: LoopApplicationAssemblyOptions,
): LoopProviderConfiguration | undefined {
  if (options.provider && options.codexProvider) {
    throw new Error("Configure either provider or codexProvider, never both.");
  }
  if (options.provider) return options.provider;
  if (!options.codexProvider) return undefined;
  return Object.freeze({ id: "codex", ...options.codexProvider });
}

function resolveProviderAssemblies(
  options: LoopApplicationAssemblyOptions,
): readonly LoopProviderAssembly[] {
  const providerConfiguration = resolveProviderConfiguration(options);
  if (options.providerAssemblies && providerConfiguration) {
    throw new Error(
      "Configure providerAssemblies or a single provider configuration, never both.",
    );
  }
  if (options.providerAssemblies) {
    return Object.freeze([...options.providerAssemblies]);
  }
  if (!providerConfiguration) return Object.freeze([]);
  return Object.freeze([
    assembleLoopProvider(
      options.providerRegistry ?? defaultLoopProviderRegistry,
      providerConfiguration,
    ),
  ]);
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

  return Object.freeze({
    findProject,
    generateAuditReport,
    generateAuditRuleManifest,
    generateDoctorReport,
    generateExecutionReport: generateExecutionReportWithEvidence,
    generateNextProjectActionReport,
    generateProjectContextReport,
    generateProjectHandoffReport,
    generateProjectPromptReport,
    generateProjectReport,
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
          loopProviderIds: providerDependency.providerIds as readonly LoopProviderId[],
          loopProviderMaxAttempts: providerDependency.maxAttempts,
        }),
    loopRunModes: LOOP_RUN_MODES,
    runConfiguredValidations,
    runLoopCommit,
    runLoopExecute,
    runLoopPlan,
  });
}
