import {
  LOOP_RUN_MODES,
  findProject,
  generateAuditReport,
  generateAuditRuleManifest,
  generateDoctorReport,
  generateExecutionReport,
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
import { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";

export type LoopApplicationCodexProviderOptions = Readonly<{
  executable: string;
  model?: string;
  timeoutMs?: number;
}>;

export type LoopApplicationAssemblyOptions = Readonly<{
  codexProvider?: LoopApplicationCodexProviderOptions;
}>;

/**
 * Public application boundary consumed by the CLI command layer.
 *
 * The contract exposes Core application services and abstract execution ports,
 * never concrete provider constructors.
 */
export type LoopApplicationAssembly = Readonly<{
  findProject: typeof findProject;
  generateAuditReport: typeof generateAuditReport;
  generateAuditRuleManifest: typeof generateAuditRuleManifest;
  generateDoctorReport: typeof generateDoctorReport;
  generateExecutionReport: typeof generateExecutionReport;
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
  loopExecutor?: LoopExecutor;
  loopRunModes: typeof LOOP_RUN_MODES;
  runConfiguredValidations: typeof runConfiguredValidations;
  runLoopCommit: typeof runLoopCommit;
  runLoopExecute: typeof runLoopExecute;
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

export function createLoopApplicationAssembly(
  options: LoopApplicationAssemblyOptions = {},
): LoopApplicationAssembly {
  const loopExecutor =
    options.codexProvider === undefined
      ? undefined
      : createCodexCliLoopExecutor({
          executable: options.codexProvider.executable,
          ...(options.codexProvider.model
            ? { model: options.codexProvider.model }
            : {}),
          ...(options.codexProvider.timeoutMs
            ? { timeoutMs: options.codexProvider.timeoutMs }
            : {}),
        });

  return Object.freeze({
    findProject,
    generateAuditReport,
    generateAuditRuleManifest,
    generateDoctorReport,
    generateExecutionReport,
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
    ...(loopExecutor === undefined ? {} : { loopExecutor }),
    loopRunModes: LOOP_RUN_MODES,
    runConfiguredValidations,
    runLoopCommit,
    runLoopExecute,
    runLoopPlan,
  });
}
