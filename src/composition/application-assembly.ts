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
import {
  assembleLoopProvider,
  defaultLoopProviderRegistry,
  type CodexProviderConfiguration,
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

export function createLoopApplicationAssembly(
  options: LoopApplicationAssemblyOptions = {},
): LoopApplicationAssembly {
  const providerConfiguration = resolveProviderConfiguration(options);
  const providerAssembly =
    providerConfiguration === undefined
      ? undefined
      : assembleLoopProvider(
          options.providerRegistry ?? defaultLoopProviderRegistry,
          providerConfiguration,
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
    ...(providerAssembly === undefined
      ? {}
      : {
          loopAgentRegistry: providerAssembly.agentRegistry,
          loopExecutor: providerAssembly.executor,
          loopProviderId: providerAssembly.id,
        }),
    loopRunModes: LOOP_RUN_MODES,
    runConfiguredValidations,
    runLoopCommit,
    runLoopExecute,
    runLoopPlan,
  });
}
