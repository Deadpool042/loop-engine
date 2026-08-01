import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const AUTOMATION_ROOT = "src/automation";
const CORE_FILE = "src/automation/types.ts";
const BARREL_FILE = "src/automation/index.ts";
const PROVIDER_TYPES_FILE = "src/automation/provider/types.ts";
const PROVIDER_BARREL_FILE = "src/automation/provider/index.ts";
const FORGE_TYPES_FILE = "src/automation/forge/types.ts";
const FORGE_BARREL_FILE = "src/automation/forge/index.ts";
const POLICY_TYPES_FILE = "src/automation/policy/types.ts";
const POLICY_BARREL_FILE = "src/automation/policy/index.ts";
const ASSEMBLY_TYPES_FILE = "src/automation/assembly/types.ts";
const ASSEMBLY_BARREL_FILE = "src/automation/assembly/index.ts";
const ORCHESTRATOR_TYPES_FILE = "src/automation/orchestrator/types.ts";
const ORCHESTRATOR_BARREL_FILE = "src/automation/orchestrator/index.ts";
const PIPELINE_FILE = "src/automation/orchestrator/pipeline.ts";
const PIPELINE_TYPES_FILE = "src/automation/orchestrator/pipeline-types.ts";
const PIPELINE_VALIDATION_FILE =
  "src/automation/orchestrator/pipeline-validation.ts";
const PIPELINE_SUMMARY_TYPES_FILE =
  "src/automation/orchestrator/pipeline-summary-types.ts";
const PIPELINE_SUMMARY_FILE = "src/automation/orchestrator/pipeline-summary.ts";
const PIPELINE_ADMISSION_TYPES_FILE =
  "src/automation/orchestrator/pipeline-admission-types.ts";
const PIPELINE_ADMISSION_FILE =
  "src/automation/orchestrator/pipeline-admission.ts";
const PIPELINE_WORKER_HANDOFF_TYPES_FILE =
  "src/automation/orchestrator/pipeline-worker-handoff-types.ts";
const PIPELINE_WORKER_HANDOFF_FILE =
  "src/automation/orchestrator/pipeline-worker-handoff.ts";
const WORKER_COMMAND_TYPES_FILE =
  "src/automation/orchestrator/worker-command-types.ts";
const WORKER_COMMAND_FILE = "src/automation/orchestrator/worker-command.ts";
const WORKER_DISPATCH_PORT_TYPES_FILE =
  "src/automation/orchestrator/worker-dispatch-port-types.ts";
const WORKER_DISPATCH_PORT_FILE =
  "src/automation/orchestrator/worker-dispatch-port.ts";
const EVALUATION_TYPES_FILE = "src/automation/orchestrator/evaluation/types.ts";
const EVALUATION_BARREL_FILE =
  "src/automation/orchestrator/evaluation/index.ts";
const PLANNING_TYPES_FILE = "src/automation/orchestrator/planning/types.ts";
const PLANNING_BARREL_FILE = "src/automation/orchestrator/planning/index.ts";
const DELEGATION_TYPES_FILE = "src/automation/orchestrator/delegation/types.ts";
const DELEGATION_BARREL_FILE =
  "src/automation/orchestrator/delegation/index.ts";
const DELEGATION_EVALUATION_TYPES_FILE =
  "src/automation/orchestrator/delegation-evaluation/types.ts";
const DELEGATION_EVALUATION_BARREL_FILE =
  "src/automation/orchestrator/delegation-evaluation/index.ts";
const DELEGATION_EVALUATION_IMPLEMENTATION_FILE =
  "src/automation/orchestrator/delegation-evaluation/evaluation.ts";
const DELEGATION_SELECTION_TYPES_FILE =
  "src/automation/orchestrator/delegation-selection/types.ts";
const DELEGATION_SELECTION_BARREL_FILE =
  "src/automation/orchestrator/delegation-selection/index.ts";
const DELEGATION_SELECTION_IMPLEMENTATION_FILE =
  "src/automation/orchestrator/delegation-selection/evaluation.ts";
const DELEGATION_DISPATCH_TYPES_FILE =
  "src/automation/orchestrator/delegation-dispatch/types.ts";
const DELEGATION_DISPATCH_BARREL_FILE =
  "src/automation/orchestrator/delegation-dispatch/index.ts";
const DELEGATION_DISPATCH_PREPARATION_FILE =
  "src/automation/orchestrator/delegation-dispatch/preparation.ts";
const AUTOMATION_RFC_FILE = "docs/architecture/rfc/0001-automation-platform.md";

const CORE_CONTRACTS = [
  "AutomationPlatform",
  "AutomationRequest",
  "AutomationResult",
  "AutomationContext",
  "AutomationCapability",
  "AutomationJob",
  "AutomationExecution",
  "AutomationMetadata",
  "AutomationError",
] as const;

const PROVIDER_CONTRACTS = [
  "AutomationProvider",
  "AutomationProviderId",
  "AutomationProviderCapability",
  "AutomationProviderRequest",
  "AutomationProviderResult",
  "AutomationProviderMetadata",
  "AutomationProviderError",
  "AutomationProviderFactory",
  "AutomationProviderRegistry",
  "AutomationProviderSelector",
] as const;

const FORGE_CONTRACTS = [
  "AutomationForge",
  "AutomationForgeId",
  "AutomationForgeCapability",
  "AutomationForgeRequest",
  "AutomationForgeResult",
  "AutomationForgeMetadata",
  "AutomationForgeError",
  "AutomationForgeFactory",
  "AutomationForgeRegistry",
  "AutomationForgeSelector",
] as const;

const POLICY_CONTRACTS = [
  "AutomationPolicy",
  "AutomationPolicyId",
  "AutomationPolicyCapability",
  "AutomationPolicyContext",
  "AutomationPolicyRequest",
  "AutomationPolicyResult",
  "AutomationPolicyDecision",
  "AutomationPolicyMetadata",
  "AutomationPolicyError",
  "AutomationPolicyEvaluator",
] as const;

const ASSEMBLY_CONTRACTS = [
  "AutomationApplicationAssembly",
  "AutomationApplicationAssemblyInput",
  "AutomationApplicationAssemblyResult",
  "AutomationApplicationDependencies",
  "AutomationApplicationConfiguration",
  "AutomationApplicationRegistry",
  "AutomationApplicationSelection",
  "AutomationApplicationError",
] as const;

const ORCHESTRATOR_CONTRACTS = [
  "AutomationOrchestrator",
  "AutomationOrchestratorInput",
  "AutomationOrchestratorResult",
  "AutomationOrchestratorRequest",
  "AutomationOrchestratorContext",
  "AutomationOrchestratorState",
  "AutomationOrchestratorStep",
  "AutomationOrchestratorDecision",
  "AutomationOrchestratorFailure",
  "AutomationOrchestratorMetadata",
] as const;

const EVALUATION_CONTRACTS = [
  "AutomationOrchestratorEvaluation",
  "AutomationOrchestratorEvaluationInput",
  "AutomationOrchestratorEvaluationResult",
  "AutomationOrchestratorEvaluationContext",
  "AutomationOrchestratorEvaluationStatus",
  "AutomationOrchestratorEvaluationDecision",
  "AutomationOrchestratorEvaluationFinding",
  "AutomationOrchestratorEvaluationEvidence",
  "AutomationOrchestratorEvaluationFailure",
  "AutomationOrchestratorEvaluator",
] as const;

const PLANNING_CONTRACTS = [
  "AutomationOrchestratorPlan",
  "AutomationOrchestratorPlanInput",
  "AutomationOrchestratorPlanResult",
  "AutomationOrchestratorPlanContext",
  "AutomationOrchestratorPlanStatus",
  "AutomationOrchestratorPlanStep",
  "AutomationOrchestratorPlanDependency",
  "AutomationOrchestratorPlanConstraint",
  "AutomationOrchestratorPlanFailure",
  "AutomationOrchestratorPlanner",
] as const;

const DELEGATION_CONTRACTS = [
  "AutomationOrchestratorDelegation",
  "AutomationOrchestratorDelegationInput",
  "AutomationOrchestratorDelegationResult",
  "AutomationOrchestratorDelegationContext",
  "AutomationOrchestratorDelegationStatus",
  "AutomationOrchestratorDelegationTarget",
  "AutomationOrchestratorDelegationFailure",
  "AutomationOrchestratorDelegator",
] as const;

const DELEGATION_EVALUATION_CONTRACTS = [
  "AutomationOrchestratorDelegationEvaluation",
  "AutomationOrchestratorDelegationEvaluationInput",
  "AutomationOrchestratorDelegationEvaluationResult",
  "AutomationOrchestratorDelegationEvaluationContext",
  "AutomationOrchestratorDelegationEvaluationStatus",
  "AutomationOrchestratorDelegationEvaluationDecision",
  "AutomationOrchestratorDelegationEvaluationFinding",
  "AutomationOrchestratorDelegationEvaluationEvidence",
  "AutomationOrchestratorDelegationEvaluationFailure",
  "AutomationOrchestratorDelegationEvaluator",
] as const;

const DELEGATION_SELECTION_CONTRACTS = [
  "AutomationOrchestratorDelegationSelection",
  "AutomationOrchestratorDelegationSelectionInput",
  "AutomationOrchestratorDelegationSelectionResult",
  "AutomationOrchestratorDelegationSelectionContext",
  "AutomationOrchestratorDelegationSelectionStatus",
  "AutomationOrchestratorDelegationSelectionDecision",
  "AutomationOrchestratorDelegationSelectionCandidate",
  "AutomationOrchestratorDelegationSelectionEvidence",
  "AutomationOrchestratorDelegationSelectionFailure",
  "AutomationOrchestratorDelegationSelector",
] as const;

const DELEGATION_DISPATCH_CONTRACTS = [
  "AutomationOrchestratorDelegationDispatch",
  "AutomationOrchestratorDelegationDispatchInput",
  "AutomationOrchestratorDelegationDispatchResult",
  "AutomationOrchestratorDelegationDispatchContext",
  "AutomationOrchestratorDelegationDispatchStatus",
  "AutomationOrchestratorDelegationDispatchDecision",
  "AutomationOrchestratorDelegationDispatchTarget",
  "AutomationOrchestratorDelegationDispatchEvidence",
  "AutomationOrchestratorDelegationDispatchFailure",
  "AutomationOrchestratorDelegationDispatcher",
] as const;

const PIPELINE_CONTRACTS = [
  "AutomationOrchestratorPipelineProgression",
  "AutomationOrchestratorPipelineResult",
  "AutomationOrchestratorPipelineValidationStatus",
  "AutomationOrchestratorPipelineValidationDiagnostic",
  "AutomationOrchestratorPipelineValidationResult",
  "AutomationOrchestratorPipelineValidationSubject",
] as const;

const PIPELINE_SUMMARY_CONTRACTS = [
  "AutomationOrchestratorPipelineSummaryStatus",
  "AutomationOrchestratorPipelineSummaryStage",
  "AutomationOrchestratorPipelineSummaryCounts",
  "AutomationOrchestratorPipelineSummary",
] as const;

const PIPELINE_ADMISSION_CONTRACTS = [
  "AutomationOrchestratorPipelineAdmissionStatus",
  "AutomationOrchestratorPipelineAdmissionReason",
  "AutomationOrchestratorPipelineAdmissionDecision",
] as const;

const PIPELINE_WORKER_HANDOFF_CONTRACTS = [
  "AutomationOrchestratorPipelineHandoffStatus",
  "AutomationOrchestratorPipelineHandoffReason",
  "AutomationOrchestratorPipelineWorkerHandoff",
] as const;

const WORKER_COMMAND_CONTRACTS = [
  "AutomationOrchestratorWorkerCommandStatus",
  "AutomationOrchestratorWorkerCommandReason",
  "AutomationOrchestratorWorkerCommandKind",
  "AutomationOrchestratorWorkerCommand",
] as const;
const WORKER_DISPATCH_PORT_CONTRACTS = [
  "AutomationOrchestratorWorkerDispatchRequestStatus",
  "AutomationOrchestratorWorkerDispatchRequestReason",
  "AutomationOrchestratorWorkerDispatchRequest",
  "AutomationOrchestratorWorkerDispatchResultStatus",
  "AutomationOrchestratorWorkerDispatchResultReason",
  "AutomationOrchestratorWorkerDispatchResult",
  "AutomationOrchestratorWorkerDispatchPort",
] as const;

const AUTOMATION_PUBLIC_CONTRACTS = [
  ["./types.js", CORE_CONTRACTS],
  ["./provider/index.js", PROVIDER_CONTRACTS],
  ["./forge/index.js", FORGE_CONTRACTS],
  ["./policy/index.js", POLICY_CONTRACTS],
  ["./assembly/index.js", ASSEMBLY_CONTRACTS],
  ["./orchestrator/index.js", ORCHESTRATOR_CONTRACTS],
  ["./orchestrator/index.js", EVALUATION_CONTRACTS],
  ["./orchestrator/index.js", PLANNING_CONTRACTS],
  ["./orchestrator/index.js", DELEGATION_CONTRACTS],
  ["./orchestrator/index.js", DELEGATION_EVALUATION_CONTRACTS],
  ["./orchestrator/index.js", DELEGATION_SELECTION_CONTRACTS],
  ["./orchestrator/index.js", DELEGATION_DISPATCH_CONTRACTS],
  ["./orchestrator/index.js", PIPELINE_CONTRACTS],
  ["./orchestrator/index.js", PIPELINE_SUMMARY_CONTRACTS],
  ["./orchestrator/index.js", PIPELINE_ADMISSION_CONTRACTS],
  ["./orchestrator/index.js", PIPELINE_WORKER_HANDOFF_CONTRACTS],
  ["./orchestrator/index.js", WORKER_COMMAND_CONTRACTS],
  ["./orchestrator/index.js", WORKER_DISPATCH_PORT_CONTRACTS],
] as const;

const REQUIRED_FILES = [
  CORE_FILE,
  BARREL_FILE,
  PROVIDER_TYPES_FILE,
  PROVIDER_BARREL_FILE,
  FORGE_TYPES_FILE,
  FORGE_BARREL_FILE,
  POLICY_TYPES_FILE,
  POLICY_BARREL_FILE,
  ASSEMBLY_TYPES_FILE,
  ASSEMBLY_BARREL_FILE,
  ORCHESTRATOR_TYPES_FILE,
  ORCHESTRATOR_BARREL_FILE,
  PIPELINE_FILE,
  PIPELINE_TYPES_FILE,
  PIPELINE_VALIDATION_FILE,
  PIPELINE_SUMMARY_TYPES_FILE,
  PIPELINE_SUMMARY_FILE,
  PIPELINE_ADMISSION_TYPES_FILE,
  PIPELINE_ADMISSION_FILE,
  PIPELINE_WORKER_HANDOFF_TYPES_FILE,
  PIPELINE_WORKER_HANDOFF_FILE,
  WORKER_COMMAND_TYPES_FILE,
  WORKER_COMMAND_FILE,
  WORKER_DISPATCH_PORT_TYPES_FILE,
  WORKER_DISPATCH_PORT_FILE,
  EVALUATION_TYPES_FILE,
  EVALUATION_BARREL_FILE,
  PLANNING_TYPES_FILE,
  PLANNING_BARREL_FILE,
  DELEGATION_TYPES_FILE,
  DELEGATION_BARREL_FILE,
  DELEGATION_EVALUATION_TYPES_FILE,
  DELEGATION_EVALUATION_BARREL_FILE,
  DELEGATION_EVALUATION_IMPLEMENTATION_FILE,
  DELEGATION_SELECTION_TYPES_FILE,
  DELEGATION_SELECTION_BARREL_FILE,
  DELEGATION_SELECTION_IMPLEMENTATION_FILE,
  DELEGATION_DISPATCH_TYPES_FILE,
  DELEGATION_DISPATCH_BARREL_FILE,
  DELEGATION_DISPATCH_PREPARATION_FILE,
] as const;

const MODULE_SPECIFIER_PATTERN =
  /(?:\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?|\bimport\s*\()\s*["']([^"']+)["']/g;

export type AutomationAuditSource = Readonly<{
  path: string;
  source: string;
}>;

export type AutomationAuditViolation = Readonly<{
  path: string;
  reason: string;
}>;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "");
}

function moduleSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  let match: RegExpExecArray | null;
  const structuralSource = withoutComments(source);

  while ((match = MODULE_SPECIFIER_PATTERN.exec(structuralSource)) !== null) {
    if (match[1] !== undefined) specifiers.push(match[1]);
  }

  return Object.freeze(specifiers);
}

function sourceFor(
  sources: readonly AutomationAuditSource[],
  path: string,
): string | null {
  return sources.find((source) => source.path === path)?.source ?? null;
}

function hasPublicContract(source: string, name: string): boolean {
  return new RegExp(`export\\s+(?:type|interface)\\s+${name}\\b`).test(
    withoutComments(source),
  );
}

function hasBarrelExport(
  source: string,
  name: string,
  target: string,
): boolean {
  return (
    new RegExp(`\\b${name}\\b`).test(withoutComments(source)) &&
    withoutComments(source).includes(`from "${target}";`)
  );
}

function countBarrelExports(source: string, target: string): number {
  return withoutComments(source).split(`from "${target}";`).length - 1;
}

function violationsForContracts(
  sources: readonly AutomationAuditSource[],
  typesPath: string,
  barrelPath: string,
  barrelTarget: string,
  contracts: readonly string[],
): readonly AutomationAuditViolation[] {
  const violations: AutomationAuditViolation[] = [];
  const types = sourceFor(sources, typesPath);
  const barrel = sourceFor(sources, barrelPath);

  if (types === null) {
    violations.push(
      Object.freeze({ path: typesPath, reason: "required_file_missing" }),
    );
    return Object.freeze(violations);
  }
  if (barrel === null) {
    violations.push(
      Object.freeze({ path: barrelPath, reason: "required_file_missing" }),
    );
    return Object.freeze(violations);
  }

  for (const name of contracts) {
    if (!hasPublicContract(types, name)) {
      violations.push(
        Object.freeze({
          path: typesPath,
          reason: `missing_public_contract:${name}`,
        }),
      );
    }
    if (!hasBarrelExport(barrel, name, barrelTarget)) {
      violations.push(
        Object.freeze({
          path: barrelPath,
          reason: `missing_barrel_export:${name}`,
        }),
      );
    }
  }

  return Object.freeze(violations);
}

export function inspectAutomationCoreContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      CORE_FILE,
      BARREL_FILE,
      "./types.js",
      CORE_CONTRACTS,
    ),
    ...violationsForContracts(
      sources,
      ORCHESTRATOR_TYPES_FILE,
      ORCHESTRATOR_BARREL_FILE,
      "./types.js",
      ORCHESTRATOR_CONTRACTS,
    ),
    ...inspectAutomationOrchestratorEvaluationContracts(sources),
    ...inspectAutomationOrchestratorPlanningContracts(sources),
    ...inspectAutomationOrchestratorDelegationContracts(sources),
    ...inspectAutomationOrchestratorDelegationEvaluationContracts(sources),
    ...inspectAutomationOrchestratorDelegationEvaluationImplementation(sources),
    ...inspectAutomationOrchestratorDelegationSelectionContracts(sources),
    ...inspectAutomationOrchestratorDelegationSelectionImplementation(sources),
    ...inspectAutomationOrchestratorDelegationDispatchContracts(sources),
    ...inspectAutomationOrchestratorDelegationDispatchPreparation(sources),
    ...inspectAutomationOrchestratorPipeline(sources),
    ...inspectAutomationOrchestratorPipelineContracts(sources),
    ...inspectAutomationOrchestratorPipelineValidation(sources),
    ...inspectAutomationOrchestratorPipelineSummary(sources),
    ...inspectAutomationContractConsistency(sources),
  ];
  const barrel = sourceFor(sources, BARREL_FILE);

  for (const [target, contracts] of AUTOMATION_PUBLIC_CONTRACTS) {
    for (const name of contracts) {
      if (barrel === null || !hasBarrelExport(barrel, name, target)) {
        violations.push(
          Object.freeze({
            path: BARREL_FILE,
            reason: `automation_barrel_not_canonical:${name}`,
          }),
        );
      }
    }
  }

  return Object.freeze(violations);
}

/**
 * Common invariants for every declarative orchestrator stage. They keep the
 * public surface closed, immutable, JSON-safe, fail-closed, and non-operational
 * without prescribing evaluation, planning, selection, or dispatch behavior.
 */
export function inspectAutomationContractConsistency(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations: AutomationAuditViolation[] = [];
  const rootBarrel = sourceFor(sources, BARREL_FILE);
  const orchestratorTypes = [
    ORCHESTRATOR_TYPES_FILE,
    EVALUATION_TYPES_FILE,
    PLANNING_TYPES_FILE,
    DELEGATION_TYPES_FILE,
    DELEGATION_EVALUATION_TYPES_FILE,
    DELEGATION_SELECTION_TYPES_FILE,
    DELEGATION_DISPATCH_TYPES_FILE,
  ];

  const hasAdmissionTypeReexport =
    rootBarrel !== null &&
    PIPELINE_ADMISSION_CONTRACTS.every((name) =>
      hasBarrelExport(rootBarrel, name, "./orchestrator/index.js"),
    );
  const expectedOrchestratorBarrelExports = hasAdmissionTypeReexport ? 2 : 1;
  if (
    rootBarrel !== null &&
    countBarrelExports(rootBarrel, "./orchestrator/index.js") !==
      expectedOrchestratorBarrelExports
  ) {
    violations.push(
      Object.freeze({
        path: BARREL_FILE,
        reason: "automation_canonical_barrel_competing_or_missing",
      }),
    );
  }

  for (const path of orchestratorTypes) {
    const source = sourceFor(sources, path);
    if (source === null) continue;
    const structuralSource = withoutComments(source);

    if (/export\s+(?:type|interface)\s+(?!Automation)/.test(structuralSource)) {
      violations.push(
        Object.freeze({
          path,
          reason: "automation_contract_name_not_automation_prefixed",
        }),
      );
    }
    if (/export\s+type\s+\w+\s*=\s*\{/.test(structuralSource)) {
      violations.push(
        Object.freeze({
          path,
          reason: "automation_contract_contains_mutable_public_shape",
        }),
      );
    }
    if (/\b\w+\s*:\s*\([^)]*\)\s*=>/.test(structuralSource)) {
      violations.push(
        Object.freeze({
          path,
          reason: "automation_contract_contains_non_json_safe_callback",
        }),
      );
    }
    if (/\bstatus\s*:\s*string\b/.test(structuralSource)) {
      violations.push(
        Object.freeze({
          path,
          reason: "automation_contract_contains_open_status",
        }),
      );
    }
    if (
      /\b(?:delegationOccurred|providerInvoked|forgeInvoked|executionStarted|dispatchOccurred)\s*:\s*true\b/.test(
        structuralSource,
      )
    ) {
      violations.push(
        Object.freeze({
          path,
          reason: "automation_contract_contains_operational_flag_true",
        }),
      );
    }
    if (
      !/delegationOccurred:\s*false;[\s\S]*?providerInvoked:\s*false;[\s\S]*?forgeInvoked:\s*false;[\s\S]*?executionStarted:\s*false;/.test(
        structuralSource,
      )
    ) {
      violations.push(
        Object.freeze({
          path,
          reason: "automation_contract_non_operational_flags_incomplete",
        }),
      );
    }
  }

  const evaluationSource = sourceFor(sources, EVALUATION_TYPES_FILE);
  if (
    evaluationSource !== null &&
    !/AutomationOrchestratorEvaluationFailure[\s\S]*?"evidence_missing"/.test(
      withoutComments(evaluationSource),
    )
  ) {
    violations.push(
      Object.freeze({
        path: EVALUATION_TYPES_FILE,
        reason: "automation_evaluation_evidence_missing_not_fail_closed",
      }),
    );
  }

  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorEvaluationContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      EVALUATION_TYPES_FILE,
      EVALUATION_BARREL_FILE,
      "./types.js",
      EVALUATION_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, EVALUATION_TYPES_FILE);
  const structuralSource = source === null ? null : withoutComments(source);

  if (
    structuralSource !== null &&
    (!/export\s+interface\s+AutomationOrchestratorEvaluator\b/.test(
      structuralSource,
    ) ||
      /(?:\bclass\b|\bfunction\b|=>|\bnew\s+|\bObject\.freeze\b)/.test(
        structuralSource,
      ) ||
      moduleSpecifiers(structuralSource).some(
        (target) =>
          !["../../types.js", "../index.js", "../../policy/index.js"].includes(
            target,
          ),
      ))
  ) {
    violations.push(
      Object.freeze({
        path: EVALUATION_TYPES_FILE,
        reason:
          "orchestrator_evaluation_contract_contains_implementation_or_forbidden_dependency",
      }),
    );
  }

  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorPlanningContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      PLANNING_TYPES_FILE,
      PLANNING_BARREL_FILE,
      "./types.js",
      PLANNING_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, PLANNING_TYPES_FILE);
  const structuralSource = source === null ? null : withoutComments(source);

  if (
    structuralSource !== null &&
    (!/export\s+interface\s+AutomationOrchestratorPlanner\b/.test(
      structuralSource,
    ) ||
      /(?:\bclass\b|\bfunction\b|=>|\bnew\s+|\bObject\.freeze\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b)/.test(
        structuralSource,
      ) ||
      moduleSpecifiers(structuralSource).some(
        (target) =>
          ![
            "../../types.js",
            "../index.js",
            "../evaluation/index.js",
            "../../policy/index.js",
          ].includes(target),
      ))
  ) {
    violations.push(
      Object.freeze({
        path: PLANNING_TYPES_FILE,
        reason:
          "orchestrator_planning_contract_contains_implementation_scheduler_or_forbidden_dependency",
      }),
    );
  }

  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorDelegationContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      DELEGATION_TYPES_FILE,
      DELEGATION_BARREL_FILE,
      "./types.js",
      DELEGATION_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, DELEGATION_TYPES_FILE);
  const structuralSource = source === null ? null : withoutComments(source);

  if (
    structuralSource !== null &&
    (!/export\s+interface\s+AutomationOrchestratorDelegator\b/.test(
      structuralSource,
    ) ||
      /(?:\bclass\b|\bfunction\b|=>|\bnew\s+|\bObject\.freeze\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b)/.test(
        structuralSource,
      ) ||
      moduleSpecifiers(structuralSource).some(
        (target) =>
          ![
            "../../types.js",
            "../index.js",
            "../evaluation/index.js",
            "../planning/index.js",
            "../../forge/index.js",
            "../../policy/index.js",
            "../../provider/index.js",
          ].includes(target),
      ))
  ) {
    violations.push(
      Object.freeze({
        path: DELEGATION_TYPES_FILE,
        reason:
          "orchestrator_delegation_contract_contains_implementation_scheduler_or_forbidden_dependency",
      }),
    );
  }

  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorDelegationEvaluationContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      DELEGATION_EVALUATION_TYPES_FILE,
      DELEGATION_EVALUATION_BARREL_FILE,
      "./types.js",
      DELEGATION_EVALUATION_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, DELEGATION_EVALUATION_TYPES_FILE);
  const structuralSource = source === null ? null : withoutComments(source);
  const hasFailClosedDecisionShape =
    structuralSource !== null &&
    /export\s+type\s+AutomationOrchestratorDelegationEvaluationDecision\s*=[\s\S]*?status:\s*"eligible";[\s\S]*?policyDecision:\s*AutomationPolicyDecision;[\s\S]*?evidence:\s*readonly\s+AutomationOrchestratorDelegationEvaluationEvidence\[\];[\s\S]*?delegationOccurred:\s*false;[\s\S]*?status:\s*"denied";[\s\S]*?delegationOccurred:\s*false;[\s\S]*?status:\s*"indeterminate";[\s\S]*?declaredDelegation:\s*AutomationOrchestratorDelegation\s*\|\s*null;[\s\S]*?policyDecision:\s*AutomationPolicyDecision\s*\|\s*null;[\s\S]*?evidence:\s*readonly\s+AutomationOrchestratorDelegationEvaluationEvidence\[\];[\s\S]*?delegationOccurred:\s*false;/.test(
      structuralSource ?? "",
    );

  if (
    structuralSource !== null &&
    (!/export\s+interface\s+AutomationOrchestratorDelegationEvaluator\b/.test(
      structuralSource,
    ) ||
      /(?:\bclass\b|\bfunction\b|=>|\bnew\s+|\bObject\.freeze\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\b(?:command|commands|executable|payload|callback|callbacks)\b|\b(?:delegate|provide|forge|execute)\s*\()/.test(
        structuralSource,
      ) ||
      moduleSpecifiers(structuralSource).some(
        (target) =>
          ![
            "../../types.js",
            "../index.js",
            "../delegation/index.js",
            "../evaluation/index.js",
            "../planning/index.js",
            "../../policy/index.js",
          ].includes(target),
      ) ||
      !hasFailClosedDecisionShape)
  ) {
    violations.push(
      Object.freeze({
        path: DELEGATION_EVALUATION_TYPES_FILE,
        reason:
          "orchestrator_delegation_evaluation_contract_contains_implementation_forbidden_dependency_or_non_fail_closed_decision",
      }),
    );
  }

  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorDelegationEvaluationImplementation(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, DELEGATION_EVALUATION_IMPLEMENTATION_FILE);
  const barrel = sourceFor(sources, DELEGATION_EVALUATION_BARREL_FILE);
  if (source === null) {
    return Object.freeze([
      Object.freeze({
        path: DELEGATION_EVALUATION_IMPLEMENTATION_FILE,
        reason: "delegation_evaluation_implementation_file_missing",
      }),
    ]);
  }

  const structuralSource = withoutComments(source);
  const forbidden =
    /(?:\bDate\.now\b|\bnew\s+Date\b|\bMath\.random\b|\bcrypto\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\bprocess\b|\b(?:node:)?(?:fs|net|http|https|child_process)\b|\b(?:exec|spawn)\w*\s*\(|\b(?:select|dispatch|provide|forge|delegate|execute)\s*\(|\bcallback\s*\(|\b(?:let|var)\s+)/;
  const allowedImports = [
    "../../types.js",
    "../../policy/index.js",
    "../delegation/index.js",
    "./types.js",
  ];
  const hasCanonicalExport =
    barrel !== null &&
    /\bevaluateAutomationOrchestratorDelegation\b/.test(
      withoutComments(barrel),
    ) &&
    withoutComments(barrel).includes('from "./evaluation.js";');
  const hasFailClosedEvidence =
    /if\s*\(!hasRequiredEvidence\(evidence\)\)\s*\{[\s\S]*?return\s+indeterminate\([\s\S]*?"evidence_missing"/.test(
      structuralSource,
    );
  const hasFalseFlags =
    /delegationOccurred:\s*false[\s\S]*?providerInvoked:\s*false[\s\S]*?forgeInvoked:\s*false[\s\S]*?executionStarted:\s*false/.test(
      structuralSource,
    );
  const hasOperationalFlag =
    /(?:delegationOccurred|providerInvoked|forgeInvoked|executionStarted)\s*:\s*true/.test(
      structuralSource,
    );
  const hasStableOrdering =
    /\.sort\(stableCompare\)/.test(structuralSource) &&
    /\[\.\.\.unique\]\s*\.sort\(stableCompare\)/.test(structuralSource);

  if (
    !/export\s+function\s+evaluateAutomationOrchestratorDelegation\s*\(\s*input:\s*AutomationOrchestratorDelegationEvaluationInput\s*,?\s*\)\s*:\s*AutomationOrchestratorDelegationEvaluationResult/.test(
      structuralSource,
    ) ||
    !hasCanonicalExport ||
    forbidden.test(structuralSource) ||
    moduleSpecifiers(structuralSource).some(
      (target) => !allowedImports.includes(target),
    ) ||
    /\binput\s*(?:\.|\[)[^;]*(?<![!<>=])=(?!=)|\binput\s*(?:\.|\[)[^;]*(?:\+\+|--)/.test(
      structuralSource,
    ) ||
    !hasFailClosedEvidence ||
    hasOperationalFlag ||
    !hasFalseFlags ||
    !hasStableOrdering
  ) {
    return Object.freeze([
      Object.freeze({
        path: DELEGATION_EVALUATION_IMPLEMENTATION_FILE,
        reason:
          "delegation_evaluation_implementation_not_pure_deterministic_or_fail_closed",
      }),
    ]);
  }

  return Object.freeze([]);
}

export function inspectAutomationOrchestratorDelegationSelectionContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      DELEGATION_SELECTION_TYPES_FILE,
      DELEGATION_SELECTION_BARREL_FILE,
      "./types.js",
      DELEGATION_SELECTION_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, DELEGATION_SELECTION_TYPES_FILE);
  const structuralSource = source === null ? null : withoutComments(source);
  const hasNonOperationalDecisionShape =
    structuralSource !== null &&
    /export\s+type\s+AutomationOrchestratorDelegationSelectionDecision\s*=[\s\S]*?status:\s*"selected";[\s\S]*?delegationOccurred:\s*false;[\s\S]*?providerInvoked:\s*false;[\s\S]*?forgeInvoked:\s*false;[\s\S]*?executionStarted:\s*false;[\s\S]*?status:\s*"rejected";[\s\S]*?delegationOccurred:\s*false;[\s\S]*?providerInvoked:\s*false;[\s\S]*?forgeInvoked:\s*false;[\s\S]*?executionStarted:\s*false;[\s\S]*?status:\s*"indeterminate";[\s\S]*?delegationOccurred:\s*false;[\s\S]*?providerInvoked:\s*false;[\s\S]*?forgeInvoked:\s*false;[\s\S]*?executionStarted:\s*false;/.test(
      structuralSource ?? "",
    );

  if (
    structuralSource !== null &&
    (!/export\s+interface\s+AutomationOrchestratorDelegationSelector\b/.test(
      structuralSource,
    ) ||
      /(?:\bclass\b|\bfunction\b|=>|\bnew\s+|\bObject\.freeze\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\b(?:command|commands|callback|callbacks|score|scoring)\b|\b(?:delegate|provide|forge|execute)\s*\()/.test(
        structuralSource,
      ) ||
      moduleSpecifiers(structuralSource).some(
        (target) =>
          ![
            "../../types.js",
            "../index.js",
            "../delegation/index.js",
            "../delegation-evaluation/index.js",
            "../evaluation/index.js",
            "../planning/index.js",
            "../../policy/index.js",
          ].includes(target),
      ) ||
      !hasNonOperationalDecisionShape)
  ) {
    violations.push(
      Object.freeze({
        path: DELEGATION_SELECTION_TYPES_FILE,
        reason:
          "orchestrator_delegation_selection_contract_contains_implementation_forbidden_dependency_or_operational_decision",
      }),
    );
  }

  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorDelegationSelectionImplementation(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, DELEGATION_SELECTION_IMPLEMENTATION_FILE);
  const barrel = sourceFor(sources, DELEGATION_SELECTION_BARREL_FILE);
  if (source === null) {
    return Object.freeze([
      Object.freeze({
        path: DELEGATION_SELECTION_IMPLEMENTATION_FILE,
        reason: "delegation_selection_implementation_file_missing",
      }),
    ]);
  }

  const structuralSource = withoutComments(source);
  const forbidden =
    /(?:\bDate\.now\b|\bnew\s+Date\b|\bMath\.random\b|\bcrypto\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\bprocess\b|\b(?:node:)?(?:fs|net|http|https|child_process)\b|\b(?:exec|spawn)\w*\s*\(|\b(?:dispatch|provide|forge|delegate|execute|command)\s*\(|\bcallback\s*\(|\b(?:let|var)\s+)/;
  const allowedImports = [
    "../../types.js",
    "../delegation/index.js",
    "../delegation-evaluation/index.js",
    "./types.js",
  ];
  const hasCanonicalExport =
    barrel !== null &&
    /\bevaluateAutomationOrchestratorDelegationSelection\b/.test(
      withoutComments(barrel),
    ) &&
    withoutComments(barrel).includes('from "./evaluation.js";');
  const hasFalseFlags =
    /delegationOccurred:\s*false[\s\S]*?providerInvoked:\s*false[\s\S]*?forgeInvoked:\s*false[\s\S]*?executionStarted:\s*false/.test(
      structuralSource,
    );
  const hasOperationalFlag =
    /(?:delegationOccurred|providerInvoked|forgeInvoked|executionStarted)\s*:\s*true/.test(
      structuralSource,
    );
  const hasStableOrdering =
    /result\.sort\(compareEvidence\)/.test(structuralSource) &&
    /valid\.sort\(compareCandidate\)/.test(structuralSource) &&
    /const\s+key\s*=\s*candidateKey\(resolved\)/.test(structuralSource);
  const hasFailClosedEvaluation =
    /evaluation\.status\s*===\s*"denied"[\s\S]*?status:\s*"rejected"/.test(
      structuralSource,
    ) &&
    /evaluation\.status\s*!==\s*"eligible"[\s\S]*?delegation_evaluation_indeterminate/.test(
      structuralSource,
    );
  const hasFailClosedCandidates =
    /source\.candidates\.length\s*===\s*0[\s\S]*?candidate_missing/.test(
      structuralSource,
    ) &&
    /resolved\s*===\s*null[\s\S]*?candidate_invalid/.test(structuralSource);

  if (
    !/export\s+function\s+evaluateAutomationOrchestratorDelegationSelection\s*\(\s*input:\s*AutomationOrchestratorDelegationSelectionInput\s*,?\s*\)\s*:\s*AutomationOrchestratorDelegationSelectionResult/.test(
      structuralSource,
    ) ||
    !hasCanonicalExport ||
    forbidden.test(structuralSource) ||
    moduleSpecifiers(structuralSource).some(
      (target) => !allowedImports.includes(target),
    ) ||
    /\binput\s*(?:\.|\[)[^;]*(?<![!<>=])=(?!=)|\binput\s*(?:\.|\[)[^;]*(?:\+\+|--)/.test(
      structuralSource,
    ) ||
    !hasFailClosedEvaluation ||
    !hasFailClosedCandidates ||
    hasOperationalFlag ||
    !hasFalseFlags ||
    !hasStableOrdering
  ) {
    return Object.freeze([
      Object.freeze({
        path: DELEGATION_SELECTION_IMPLEMENTATION_FILE,
        reason:
          "delegation_selection_implementation_not_pure_deterministic_or_fail_closed",
      }),
    ]);
  }

  return Object.freeze([]);
}

export function inspectAutomationOrchestratorDelegationDispatchContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      DELEGATION_DISPATCH_TYPES_FILE,
      DELEGATION_DISPATCH_BARREL_FILE,
      "./types.js",
      DELEGATION_DISPATCH_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, DELEGATION_DISPATCH_TYPES_FILE);
  const structuralSource = source === null ? null : withoutComments(source);
  const hasNonOperationalDecisionShape =
    structuralSource !== null &&
    /export\s+type\s+AutomationOrchestratorDelegationDispatchDecision\s*=[\s\S]*?status:\s*"prepared";[\s\S]*?dispatchOccurred:\s*false;[\s\S]*?delegationOccurred:\s*false;[\s\S]*?providerInvoked:\s*false;[\s\S]*?forgeInvoked:\s*false;[\s\S]*?executionStarted:\s*false;[\s\S]*?status:\s*"rejected";[\s\S]*?dispatchOccurred:\s*false;[\s\S]*?delegationOccurred:\s*false;[\s\S]*?providerInvoked:\s*false;[\s\S]*?forgeInvoked:\s*false;[\s\S]*?executionStarted:\s*false;[\s\S]*?status:\s*"indeterminate";[\s\S]*?dispatchOccurred:\s*false;[\s\S]*?delegationOccurred:\s*false;[\s\S]*?providerInvoked:\s*false;[\s\S]*?forgeInvoked:\s*false;[\s\S]*?executionStarted:\s*false;/.test(
      structuralSource ?? "",
    );

  if (
    structuralSource !== null &&
    (!/export\s+interface\s+AutomationOrchestratorDelegationDispatcher\b/.test(
      structuralSource,
    ) ||
      /(?:\bclass\b|\bfunction\b|=>|\bnew\s+|\bObject\.freeze\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\b(?:command|commands|argv|callback|callbacks|payload|serialize|serialization|retry|retries|deliver|delivery)\b|\b(?:dispatch|delegate|provide|forge|execute)\s*\()/.test(
        structuralSource,
      ) ||
      moduleSpecifiers(structuralSource).some(
        (target) =>
          ![
            "../../types.js",
            "../index.js",
            "../delegation/index.js",
            "../delegation-evaluation/index.js",
            "../delegation-selection/index.js",
            "../evaluation/index.js",
            "../planning/index.js",
            "../../policy/index.js",
          ].includes(target),
      ) ||
      !hasNonOperationalDecisionShape)
  ) {
    violations.push(
      Object.freeze({
        path: DELEGATION_DISPATCH_TYPES_FILE,
        reason:
          "orchestrator_delegation_dispatch_contract_contains_implementation_forbidden_dependency_or_operational_decision",
      }),
    );
  }

  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorDelegationDispatchPreparation(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, DELEGATION_DISPATCH_PREPARATION_FILE);
  const barrel = sourceFor(sources, DELEGATION_DISPATCH_BARREL_FILE);
  if (source === null) {
    return Object.freeze([
      Object.freeze({
        path: DELEGATION_DISPATCH_PREPARATION_FILE,
        reason: "delegation_dispatch_preparation_file_missing",
      }),
    ]);
  }
  const structuralSource = withoutComments(source);
  const forbidden =
    /(?:\bDate\.now\b|\bnew\s+Date\b|\bMath\.random\b|\bcrypto\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\bprocess\b|\b(?:node:)?(?:fs|net|http|https|child_process)\b|\b(?:exec|spawn)\w*\s*\(|\b(?:send|deliver|invoke|delegate|provide|forge|execute|command)\s*\(|\bcallback\s*\(|\b(?:let|var)\s+)/;
  const allowedImports = ["../../types.js", "./types.js"];
  const hasCanonicalExport =
    barrel !== null &&
    /\bprepareAutomationOrchestratorDelegationDispatch\b/.test(
      withoutComments(barrel),
    ) &&
    withoutComments(barrel).includes('from "./preparation.js";');
  const hasFalseFlags =
    /dispatchOccurred:\s*false[\s\S]*?delegationOccurred:\s*false[\s\S]*?providerInvoked:\s*false[\s\S]*?forgeInvoked:\s*false[\s\S]*?executionStarted:\s*false/.test(
      structuralSource,
    );
  const hasOperationalFlag =
    /(?:dispatchOccurred|delegationOccurred|providerInvoked|forgeInvoked|executionStarted)\s*:\s*true/.test(
      structuralSource,
    );
  const hasStableOrdering =
    /result\.sort\(compareEvidence\)/.test(structuralSource) &&
    /const\s+key\s*=\s*`\$\{kind\}/.test(structuralSource);
  const hasFailClosedSelection =
    /selection\.status\s*===\s*"rejected"[\s\S]*?status:\s*"rejected"/.test(
      structuralSource,
    ) &&
    /selection\.status\s*!==\s*"selected"[\s\S]*?selection_indeterminate/.test(
      structuralSource,
    );
  const hasFailClosedTargetAndEvidence =
    /!hasRequiredEvidence\(dispatchEvidence\)[\s\S]*?evidence_missing/.test(
      structuralSource,
    ) &&
    /dispatchTarget\s*===\s*null[\s\S]*?target_invalid/.test(structuralSource);
  if (
    !/export\s+function\s+prepareAutomationOrchestratorDelegationDispatch\s*\(\s*input:\s*AutomationOrchestratorDelegationDispatchInput\s*,?\s*\)\s*:\s*AutomationOrchestratorDelegationDispatchResult/.test(
      structuralSource,
    ) ||
    !hasCanonicalExport ||
    forbidden.test(structuralSource) ||
    moduleSpecifiers(structuralSource).some(
      (target) => !allowedImports.includes(target),
    ) ||
    /\binput\s*(?:\.|\[)[^;]*(?<![!<>=])=(?!=)|\binput\s*(?:\.|\[)[^;]*(?:\+\+|--)/.test(
      structuralSource,
    ) ||
    !hasFailClosedSelection ||
    !hasFailClosedTargetAndEvidence ||
    hasOperationalFlag ||
    !hasFalseFlags ||
    !hasStableOrdering
  ) {
    return Object.freeze([
      Object.freeze({
        path: DELEGATION_DISPATCH_PREPARATION_FILE,
        reason:
          "delegation_dispatch_preparation_not_pure_deterministic_or_fail_closed",
      }),
    ]);
  }
  return Object.freeze([]);
}

export function inspectAutomationOrchestratorPipeline(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, PIPELINE_FILE);
  const barrel = sourceFor(sources, ORCHESTRATOR_BARREL_FILE);
  if (source === null) {
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_FILE,
        reason: "automation_pipeline_file_missing",
      }),
    ]);
  }
  const structuralSource = withoutComments(source);
  const forbidden =
    /(?:\bDate\.now\b|\bnew\s+Date\b|\bMath\.random\b|\bcrypto\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\bprocess\b|\b(?:node:)?(?:fs|net|http|https|child_process)\b|\b(?:exec|spawn)\w*\s*\(|\b(?:send|deliver|invoke|delegate|provide|forge|execute|command)\s*\(|\bcallback\s*\(|\b(?:let|var)\s+)/;
  const allowedImports = [
    "./delegation-evaluation/index.js",
    "./delegation-selection/index.js",
    "./delegation-dispatch/index.js",
    "./pipeline-types.js",
  ];
  const hasCanonicalExport =
    barrel !== null &&
    /\bevaluateAutomationOrchestratorPipeline\b/.test(
      withoutComments(barrel),
    ) &&
    withoutComments(barrel).includes('from "./pipeline.js";');
  const hasComposition =
    /evaluateAutomationOrchestratorDelegation\(/.test(structuralSource) &&
    /evaluateAutomationOrchestratorDelegationSelection\(/.test(
      structuralSource,
    ) &&
    /prepareAutomationOrchestratorDelegationDispatch\(/.test(structuralSource);
  const hasShortCircuit =
    /delegationEvaluation\.status\s*!==\s*"eligible"[\s\S]*?delegationSelection:\s*null[\s\S]*?delegationDispatch:\s*null/.test(
      structuralSource,
    ) &&
    /delegationSelection\.status\s*!==\s*"selected"[\s\S]*?delegationDispatch:\s*null/.test(
      structuralSource,
    );
  if (
    !/export\s+function\s+evaluateAutomationOrchestratorPipeline\b/.test(
      structuralSource,
    ) ||
    !hasCanonicalExport ||
    !hasComposition ||
    !hasShortCircuit ||
    /type\s+AutomationOrchestratorPipelineResult\s*=/.test(structuralSource) ||
    forbidden.test(structuralSource) ||
    moduleSpecifiers(structuralSource).some(
      (target) => !allowedImports.includes(target),
    ) ||
    /\binput\s*(?:\.|\[)[^;]*(?<![!<>=])=(?!=)|\binput\s*(?:\.|\[)[^;]*(?:\+\+|--)/.test(
      structuralSource,
    )
  ) {
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_FILE,
        reason: "automation_pipeline_not_pure_composed_or_fail_closed",
      }),
    ]);
  }
  return Object.freeze([]);
}

export function inspectAutomationOrchestratorPipelineContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      PIPELINE_TYPES_FILE,
      ORCHESTRATOR_BARREL_FILE,
      "./pipeline-types.js",
      PIPELINE_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, PIPELINE_TYPES_FILE);
  const structuralSource = source === null ? null : withoutComments(source);
  const allowedImports = [
    "./delegation-evaluation/index.js",
    "./delegation-selection/index.js",
    "./delegation-dispatch/index.js",
  ];
  const hasClosedShapes =
    structuralSource !== null &&
    /AutomationOrchestratorPipelineProgression\s*=\s*[\s\S]*?"evaluation"[\s\S]*?"selection"[\s\S]*?"dispatch"/.test(
      structuralSource,
    ) &&
    /AutomationOrchestratorPipelineValidationStatus\s*=\s*[\s\S]*?"valid"[\s\S]*?"invalid"/.test(
      structuralSource,
    ) &&
    /delegationSelection:\s*AutomationOrchestratorDelegationSelectionResult\s*\|\s*null/.test(
      structuralSource,
    ) &&
    /delegationDispatch:\s*AutomationOrchestratorDelegationDispatchResult\s*\|\s*null/.test(
      structuralSource,
    ) &&
    /status:\s*"valid"[\s\S]*?valid:\s*true[\s\S]*?status:\s*"invalid"[\s\S]*?valid:\s*false/.test(
      structuralSource,
    ) &&
    /AutomationOrchestratorPipelineValidationSubject[\s\S]*?status:\s*"complete"[\s\S]*?status:\s*"incomplete"/.test(
      structuralSource,
    ) &&
    /subject:\s*AutomationOrchestratorPipelineValidationSubject/.test(
      structuralSource,
    ) &&
    (structuralSource.match(
      /export\s+type\s+AutomationOrchestratorPipelineValidationSubject\b/g,
    )?.length ?? 0) === 1 &&
    /export\s+type\s+AutomationOrchestratorPipelineResult\s*=\s*Readonly/.test(
      structuralSource,
    ) &&
    /export\s+type\s+AutomationOrchestratorPipelineValidationDiagnostic\s*=\s*Readonly/.test(
      structuralSource,
    );
  if (
    structuralSource === null ||
    moduleSpecifiers(structuralSource).some(
      (target) => !allowedImports.includes(target),
    ) ||
    /\|\s*string\b/.test(structuralSource) ||
    /(?:\b(?:class|function)\b|=>|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\b(?:process|Date|Math|crypto)\b|\b(?:node:)?(?:fs|net|http|https|child_process)\b|\b(?:callback|command|repair|ready|success|executionStarted)\b|\b(?:pipeline|evidence|metadata)\s*:)/.test(
      structuralSource,
    ) ||
    !hasClosedShapes
  ) {
    violations.push(
      Object.freeze({
        path: PIPELINE_TYPES_FILE,
        reason:
          "automation_pipeline_public_contracts_not_closed_immutable_or_dependency_safe",
      }),
    );
  }
  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorPipelineSummary(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      PIPELINE_SUMMARY_TYPES_FILE,
      ORCHESTRATOR_BARREL_FILE,
      "./pipeline-summary-types.js",
      PIPELINE_SUMMARY_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, PIPELINE_SUMMARY_FILE);
  const barrel = sourceFor(sources, ORCHESTRATOR_BARREL_FILE);
  const structuralSource = source === null ? null : withoutComments(source);
  const allowedImports = ["./pipeline-types.js", "./pipeline-summary-types.js"];
  const forbidden =
    /(?:\b(?:evaluateAutomationOrchestratorPipeline|validateAutomationOrchestratorPipeline|evaluateAutomationOrchestratorDelegation|evaluateAutomationOrchestratorDelegationSelection|prepareAutomationOrchestratorDelegationDispatch)\s*\(|\bDate\.now\b|\bnew\s+Date\b|\bMath\.random\b|\bcrypto\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\bprocess\b|\b(?:node:)?(?:fs|net|http|https|child_process)\b|\b(?:exec|spawn)\w*\s*\(|\b(?:let|var)\s+)/;
  const hasCanonicalExport =
    barrel !== null &&
    /\bsummarizeAutomationOrchestratorPipeline\b/.test(
      withoutComments(barrel),
    ) &&
    withoutComments(barrel).includes('from "./pipeline-summary.js";');
  if (
    structuralSource === null ||
    !/export\s+function\s+summarizeAutomationOrchestratorPipeline\b/.test(
      structuralSource,
    ) ||
    !hasCanonicalExport ||
    forbidden.test(structuralSource) ||
    moduleSpecifiers(structuralSource).some(
      (target) => !allowedImports.includes(target),
    ) ||
    !/subjectMatches\(/.test(structuralSource) ||
    /\.length\s*>\s*0|\.trim\(\)|\.to(?:Lower|Upper)Case\(\)/.test(
      structuralSource,
    ) ||
    !/isStageStatusForKind\(/.test(structuralSource) ||
    !/kind\s*===\s*"evaluation"[\s\S]*?"eligible"[\s\S]*?"denied"[\s\S]*?"indeterminate"/.test(
      structuralSource,
    ) ||
    !/kind\s*===\s*"selection"[\s\S]*?"selected"[\s\S]*?"rejected"[\s\S]*?"indeterminate"/.test(
      structuralSource,
    ) ||
    !/"prepared"\s*\|\|\s*value\s*===\s*"rejected"[\s\S]*?"indeterminate"/.test(
      structuralSource,
    ) ||
    !/status\s*===\s*"complete"/.test(structuralSource) ||
    !/dispatchOccurred:\s*false[\s\S]*?delegationOccurred:\s*false[\s\S]*?providerInvoked:\s*false[\s\S]*?forgeInvoked:\s*false[\s\S]*?executionStarted:\s*false/.test(
      structuralSource,
    ) ||
    /\b(?:pipeline|validation)\s*(?:\.|\[)[^;]*(?<![!<>=])=(?!=)/.test(
      structuralSource,
    )
  ) {
    violations.push(
      Object.freeze({
        path: PIPELINE_SUMMARY_FILE,
        reason: "automation_pipeline_summary_not_pure_compact_or_fail_closed",
      }),
    );
  }
  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorPipelineAdmissionContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      PIPELINE_ADMISSION_TYPES_FILE,
      ORCHESTRATOR_BARREL_FILE,
      "./pipeline-admission-types.js",
      PIPELINE_ADMISSION_CONTRACTS,
    ),
  ];
  const implementation = sourceFor(sources, PIPELINE_ADMISSION_FILE);
  const orchestratorBarrel = sourceFor(sources, ORCHESTRATOR_BARREL_FILE);
  const automationBarrel = sourceFor(sources, BARREL_FILE);

  if (implementation === null) {
    violations.push(
      Object.freeze({
        path: PIPELINE_ADMISSION_FILE,
        reason: "automation_pipeline_admission_file_missing",
      }),
    );
  } else if (
    !/export\s+function\s+decideAutomationOrchestratorPipelineAdmission\b/.test(
      withoutComments(implementation),
    )
  ) {
    violations.push(
      Object.freeze({
        path: PIPELINE_ADMISSION_FILE,
        reason: "automation_pipeline_admission_function_missing",
      }),
    );
  }

  for (const [path, source, target] of [
    [ORCHESTRATOR_BARREL_FILE, orchestratorBarrel, "./pipeline-admission.js"],
    [BARREL_FILE, automationBarrel, "./orchestrator/pipeline-admission.js"],
  ] as const) {
    if (
      source === null ||
      !hasBarrelExport(
        source,
        "decideAutomationOrchestratorPipelineAdmission",
        target,
      )
    ) {
      violations.push(
        Object.freeze({
          path,
          reason:
            "automation_pipeline_admission_function_not_canonically_exported",
        }),
      );
    }
  }

  for (const name of PIPELINE_ADMISSION_CONTRACTS) {
    if (
      automationBarrel === null ||
      !hasBarrelExport(automationBarrel, name, "./orchestrator/index.js")
    ) {
      violations.push(
        Object.freeze({
          path: BARREL_FILE,
          reason: `automation_pipeline_admission_type_not_canonically_exported:${name}`,
        }),
      );
    }
  }

  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorPipelineAdmissionPurity(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, PIPELINE_ADMISSION_FILE);
  if (source === null) {
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_ADMISSION_FILE,
        reason: "automation_pipeline_admission_file_missing",
      }),
    ]);
  }

  const structuralSource = withoutComments(source);
  const allowedImports = [
    "./pipeline-admission-types.js",
    "./pipeline-summary-types.js",
  ];
  const forbidden =
    /(?:\b(?:evaluateAutomationOrchestratorPipeline|validateAutomationOrchestratorPipeline|evaluateAutomationOrchestratorDelegation|evaluateAutomationOrchestratorDelegationSelection|prepareAutomationOrchestratorDelegationDispatch|dispatchAutomation|executeAutomation)\s*\(|\bDate\.now\b|\bnew\s+Date\b|\bMath\.random\b|\bcrypto\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\bprocess\b|\b(?:node:)?(?:fs|net|http|https|child_process)\b|\b(?:exec|spawn)\w*\s*\(|\b(?:send|deliver|invoke|delegate|provide)\s*\(|\b(?:let|var)\s+)/;
  const mutatesInput =
    /\b(?:summary|source)\s*(?:\.|\[)[^;]*(?<![!<>=])=(?!=)|\b(?:summary|source)\s*(?:\.|\[)[^;]*(?:\+\+|--)/.test(
      structuralSource,
    );

  if (
    moduleSpecifiers(structuralSource).some(
      (target) => !allowedImports.includes(target),
    ) ||
    forbidden.test(structuralSource) ||
    mutatesInput
  ) {
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_ADMISSION_FILE,
        reason: "automation_pipeline_admission_not_pure_or_dependency_safe",
      }),
    ]);
  }

  return Object.freeze([]);
}

export function inspectAutomationOrchestratorPipelineAdmissionMatrix(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const implementation = sourceFor(sources, PIPELINE_ADMISSION_FILE);
  const types = sourceFor(sources, PIPELINE_ADMISSION_TYPES_FILE);
  const source =
    implementation === null ? null : withoutComments(implementation);
  const typeSource = types === null ? null : withoutComments(types);
  const hasClosedProgressionMatrix =
    source !== null &&
    /if\s*\(\s*progression\s*===\s*"evaluation"[\s\S]*?\["denied",\s*"indeterminate"\]/.test(
      source,
    ) &&
    /if\s*\(\s*progression\s*===\s*"selection"[\s\S]*?\["eligible"\][\s\S]*?\["rejected",\s*"indeterminate"\]/.test(
      source,
    ) &&
    /if\s*\(\s*progression\s*===\s*"dispatch"[\s\S]*?\["eligible"\][\s\S]*?\["selected"\][\s\S]*?\["prepared",\s*"rejected",\s*"indeterminate"\]/.test(
      source,
    );
  const hasClosedAdmissionOutcomes =
    typeSource !== null &&
    /"admitted"\s*\|\s*"rejected"\s*\|\s*"indeterminate"/.test(typeSource) &&
    /"dispatch_prepared"[\s\S]*?"pipeline_rejected"[\s\S]*?"pipeline_indeterminate"[\s\S]*?"invalid_summary"/.test(
      typeSource,
    );
  const hasStructuralAdmission =
    source !== null &&
    /source\.status\s*!==\s*"valid"/.test(source) &&
    /source\.valid\s*!==\s*true/.test(source) &&
    /source\.validationSubjectStatus\s*!==\s*"complete"/.test(source) &&
    /stage\(/.test(source) &&
    /decision\("admitted",\s*"dispatch_prepared"/.test(source) &&
    !/\bsummary\.valid\s*(?:===|!==)?[\s\S]{0,160}?decision\("admitted"/.test(
      source,
    ) &&
    /return\s+decision\("indeterminate",\s*"invalid_summary",\s*null\);\s*}\s*$/.test(
      source,
    );

  if (
    !hasClosedProgressionMatrix ||
    !hasClosedAdmissionOutcomes ||
    !hasStructuralAdmission
  ) {
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_ADMISSION_FILE,
        reason:
          "automation_pipeline_admission_matrix_not_closed_or_fail_closed",
      }),
    ]);
  }

  return Object.freeze([]);
}

export function inspectAutomationOrchestratorPipelineAdmissionIdentifiers(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, PIPELINE_ADMISSION_FILE);
  if (source === null) {
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_ADMISSION_FILE,
        reason: "automation_pipeline_admission_file_missing",
      }),
    ]);
  }

  const structuralSource = withoutComments(source);
  const hasOptionalIdentifierTypeChecks =
    /candidateId\s*!==\s*null\s*&&\s*typeof\s+candidateId\s*!==\s*"string"/.test(
      structuralSource,
    ) &&
    /targetId\s*!==\s*null\s*&&\s*typeof\s+targetId\s*!==\s*"string"/.test(
      structuralSource,
    );
  const hasFalseOperationalFlags =
    /dispatchOccurred:\s*false[\s\S]*?delegationOccurred:\s*false[\s\S]*?providerInvoked:\s*false[\s\S]*?forgeInvoked:\s*false[\s\S]*?executionStarted:\s*false/.test(
      structuralSource,
    );
  const normalizesIdentifier =
    /\.trim\(\)|\.length\s*>\s*0|\.to(?:Lower|Upper)Case\(\)/.test(
      structuralSource,
    );

  if (
    !hasOptionalIdentifierTypeChecks ||
    !hasFalseOperationalFlags ||
    normalizesIdentifier
  ) {
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_ADMISSION_FILE,
        reason:
          "automation_pipeline_admission_identifiers_or_operational_flags_not_fail_closed",
      }),
    ]);
  }

  return Object.freeze([]);
}

export function inspectAutomationOrchestratorPipelineWorkerHandoffContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      PIPELINE_WORKER_HANDOFF_TYPES_FILE,
      ORCHESTRATOR_BARREL_FILE,
      "./pipeline-worker-handoff-types.js",
      PIPELINE_WORKER_HANDOFF_CONTRACTS,
    ),
  ];
  const implementation = sourceFor(sources, PIPELINE_WORKER_HANDOFF_FILE);
  const orchestratorBarrel = sourceFor(sources, ORCHESTRATOR_BARREL_FILE);
  const automationBarrel = sourceFor(sources, BARREL_FILE);

  if (implementation === null) {
    violations.push(
      Object.freeze({
        path: PIPELINE_WORKER_HANDOFF_FILE,
        reason: "automation_pipeline_worker_handoff_file_missing",
      }),
    );
  } else if (
    !/export\s+function\s+prepareAutomationOrchestratorPipelineWorkerHandoff\b/.test(
      withoutComments(implementation),
    )
  ) {
    violations.push(
      Object.freeze({
        path: PIPELINE_WORKER_HANDOFF_FILE,
        reason: "automation_pipeline_worker_handoff_function_missing",
      }),
    );
  }

  for (const [path, source, target] of [
    [
      ORCHESTRATOR_BARREL_FILE,
      orchestratorBarrel,
      "./pipeline-worker-handoff.js",
    ],
    [
      BARREL_FILE,
      automationBarrel,
      "./orchestrator/pipeline-worker-handoff.js",
    ],
  ] as const) {
    if (
      source === null ||
      !hasBarrelExport(
        source,
        "prepareAutomationOrchestratorPipelineWorkerHandoff",
        target,
      )
    ) {
      violations.push(
        Object.freeze({
          path,
          reason:
            "automation_pipeline_worker_handoff_function_not_canonically_exported",
        }),
      );
    }
  }

  for (const name of PIPELINE_WORKER_HANDOFF_CONTRACTS) {
    if (
      automationBarrel === null ||
      !hasBarrelExport(automationBarrel, name, "./orchestrator/index.js")
    ) {
      violations.push(
        Object.freeze({
          path: BARREL_FILE,
          reason: `automation_pipeline_worker_handoff_type_not_canonically_exported:${name}`,
        }),
      );
    }
  }
  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorPipelineWorkerHandoffPurity(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, PIPELINE_WORKER_HANDOFF_FILE);
  if (source === null)
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_WORKER_HANDOFF_FILE,
        reason: "automation_pipeline_worker_handoff_file_missing",
      }),
    ]);
  const structuralSource = withoutComments(source);
  const allowedImports = [
    "./pipeline-admission-types.js",
    "./pipeline-worker-handoff-types.js",
  ];
  const forbidden =
    /(?:\b(?:evaluateAutomationOrchestratorPipeline|validateAutomationOrchestratorPipeline|summarizeAutomationOrchestratorPipeline|decideAutomationOrchestratorPipelineAdmission|evaluateAutomationOrchestratorDelegation|evaluateAutomationOrchestratorDelegationSelection|prepareAutomationOrchestratorDelegationDispatch|dispatchAutomation|executeAutomation)\s*\(|\bDate\.now\b|\bnew\s+Date\b|\bMath\.random\b|\bcrypto\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\bprocess\b|\b(?:node:)?(?:fs|net|http|https|child_process)\b|\b(?:exec|spawn)\w*\s*\(|\b(?:send|deliver|invoke|delegate|provide|selectWorker|createCommand)\s*\(|\b(?:let|var)\s+)/;
  const mutatesInput =
    /\b(?:admission|source)\s*(?:\.\w+|\[[^\]]+\])\s*=(?!=)|\b(?:admission|source)\s*(?:\.\w+|\[[^\]]+\])\s*(?:\+\+|--)/.test(
      structuralSource,
    );
  if (
    moduleSpecifiers(structuralSource).some(
      (target) => !allowedImports.includes(target),
    ) ||
    forbidden.test(structuralSource) ||
    mutatesInput
  )
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_WORKER_HANDOFF_FILE,
        reason:
          "automation_pipeline_worker_handoff_not_pure_or_dependency_safe",
      }),
    ]);
  return Object.freeze([]);
}

export function inspectAutomationOrchestratorPipelineWorkerHandoffMatrix(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const implementation = sourceFor(sources, PIPELINE_WORKER_HANDOFF_FILE);
  const types = sourceFor(sources, PIPELINE_WORKER_HANDOFF_TYPES_FILE);
  const source =
    implementation === null ? null : withoutComments(implementation);
  const typeSource = types === null ? null : withoutComments(types);
  const hasClosedTypes =
    typeSource !== null &&
    /"prepared"\s*\|\s*"rejected"/.test(typeSource) &&
    /"admission_accepted"[\s\S]*?"admission_rejected"[\s\S]*?"invalid_admission"/.test(
      typeSource,
    );
  const hasClosedMatrix =
    source !== null &&
    /source\.status\s*===\s*"admitted"/.test(source) &&
    /source\.admitted\s*===\s*true/.test(source) &&
    /source\.reason\s*===\s*"dispatch_prepared"\s*&&\s*source\.progression\s*===\s*"dispatch"/.test(
      source,
    ) &&
    /source\.status\s*===\s*"rejected"/.test(source) &&
    /source\.status\s*===\s*"indeterminate"/.test(source) &&
    /source\.reason\s*===\s*"pipeline_rejected"/.test(source) &&
    /source\.reason\s*===\s*"pipeline_indeterminate"/.test(source) &&
    /handoff\("prepared",\s*"admission_accepted"/.test(source) &&
    /handoff\s*\(\s*"rejected",\s*"admission_rejected"/.test(source) &&
    /return\s+handoff\("rejected",\s*"invalid_admission",\s*null,\s*null\);\s*}\s*$/.test(
      source,
    ) &&
    !/if\s*\(\s*admission\.admitted\s*\)/.test(source);
  if (!hasClosedTypes || !hasClosedMatrix)
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_WORKER_HANDOFF_FILE,
        reason:
          "automation_pipeline_worker_handoff_matrix_not_closed_or_fail_closed",
      }),
    ]);
  return Object.freeze([]);
}

export function inspectAutomationOrchestratorPipelineWorkerHandoffIdentifiers(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, PIPELINE_WORKER_HANDOFF_FILE);
  if (source === null)
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_WORKER_HANDOFF_FILE,
        reason: "automation_pipeline_worker_handoff_file_missing",
      }),
    ]);
  const structuralSource = withoutComments(source);
  const hasIdentifierChecks =
    /typeof source\.requestId !== "string"/.test(structuralSource) &&
    /typeof source\.delegationId !== "string"/.test(structuralSource) &&
    /source\.candidateId !== null && typeof source\.candidateId !== "string"/.test(
      structuralSource,
    ) &&
    /source\.targetId !== null && typeof source\.targetId !== "string"/.test(
      structuralSource,
    );
  const hasFalseFlags =
    /workerSelected:\s*false[\s\S]*?commandCreated:\s*false[\s\S]*?dispatchOccurred:\s*false[\s\S]*?delegationOccurred:\s*false[\s\S]*?providerInvoked:\s*false[\s\S]*?forgeInvoked:\s*false[\s\S]*?executionStarted:\s*false/.test(
      structuralSource,
    );
  const normalizesIdentifier =
    /\.trim\(\)|\.length\s*>\s*0|\.to(?:Lower|Upper)Case\(\)/.test(
      structuralSource,
    );
  if (!hasIdentifierChecks || !hasFalseFlags || normalizesIdentifier)
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_WORKER_HANDOFF_FILE,
        reason:
          "automation_pipeline_worker_handoff_identifiers_or_operational_flags_not_fail_closed",
      }),
    ]);
  return Object.freeze([]);
}

export function inspectAutomationOrchestratorWorkerCommandContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      WORKER_COMMAND_TYPES_FILE,
      ORCHESTRATOR_BARREL_FILE,
      "./worker-command-types.js",
      WORKER_COMMAND_CONTRACTS,
    ),
  ];
  const implementation = sourceFor(sources, WORKER_COMMAND_FILE);
  const orchestratorBarrel = sourceFor(sources, ORCHESTRATOR_BARREL_FILE);
  const automationBarrel = sourceFor(sources, BARREL_FILE);
  if (implementation === null) {
    violations.push(
      Object.freeze({
        path: WORKER_COMMAND_FILE,
        reason: "automation_worker_command_file_missing",
      }),
    );
  } else if (
    !/export\s+function\s+prepareAutomationOrchestratorWorkerCommand\b/.test(
      withoutComments(implementation),
    )
  ) {
    violations.push(
      Object.freeze({
        path: WORKER_COMMAND_FILE,
        reason: "automation_worker_command_function_missing",
      }),
    );
  }
  for (const [path, source, target] of [
    [ORCHESTRATOR_BARREL_FILE, orchestratorBarrel, "./worker-command.js"],
    [BARREL_FILE, automationBarrel, "./orchestrator/worker-command.js"],
  ] as const) {
    if (
      source === null ||
      !hasBarrelExport(
        source,
        "prepareAutomationOrchestratorWorkerCommand",
        target,
      )
    )
      violations.push(
        Object.freeze({
          path,
          reason: "automation_worker_command_function_not_canonically_exported",
        }),
      );
  }
  for (const name of WORKER_COMMAND_CONTRACTS) {
    if (
      automationBarrel === null ||
      !hasBarrelExport(automationBarrel, name, "./orchestrator/index.js")
    )
      violations.push(
        Object.freeze({
          path: BARREL_FILE,
          reason: `automation_worker_command_type_not_canonically_exported:${name}`,
        }),
      );
  }
  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorWorkerCommandPurity(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, WORKER_COMMAND_FILE);
  if (source === null)
    return Object.freeze([
      Object.freeze({
        path: WORKER_COMMAND_FILE,
        reason: "automation_worker_command_file_missing",
      }),
    ]);
  const structuralSource = withoutComments(source);
  const allowedImports = [
    "./pipeline-worker-handoff-types.js",
    "./worker-command-types.js",
  ];
  const forbidden =
    /(?:\b(?:evaluateAutomationOrchestratorPipeline|validateAutomationOrchestratorPipeline|summarizeAutomationOrchestratorPipeline|decideAutomationOrchestratorPipelineAdmission|prepareAutomationOrchestratorPipelineWorkerHandoff|dispatchAutomation|executeAutomation)\s*\(|\bDate\.now\b|\bnew\s+Date\b|\bMath\.random\b|\bcrypto\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\bprocess\b|\b(?:node:)?(?:fs|net|http|https|child_process)\b|\b(?:exec|spawn)\w*\s*\(|\b(?:send|deliver|invoke|delegate|provide|selectWorker|createCommand)\s*\(|\b(?:let|var)\s+)/;
  const mutatesInput =
    /\b(?:handoff|source)\s*(?:\.\w+|\[[^\]]+\])\s*=(?!=)|\b(?:handoff|source)\s*(?:\.\w+|\[[^\]]+\])\s*(?:\+\+|--)/.test(
      structuralSource,
    );
  if (
    moduleSpecifiers(structuralSource).some(
      (target) => !allowedImports.includes(target),
    ) ||
    forbidden.test(structuralSource) ||
    mutatesInput
  )
    return Object.freeze([
      Object.freeze({
        path: WORKER_COMMAND_FILE,
        reason: "automation_worker_command_not_pure_or_dependency_safe",
      }),
    ]);
  return Object.freeze([]);
}

export function inspectAutomationOrchestratorWorkerCommandMatrix(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const implementation = sourceFor(sources, WORKER_COMMAND_FILE);
  const types = sourceFor(sources, WORKER_COMMAND_TYPES_FILE);
  const source =
    implementation === null ? null : withoutComments(implementation);
  const typeSource = types === null ? null : withoutComments(types);
  const hasClosedTypes =
    typeSource !== null &&
    /"prepared"\s*\|\s*"rejected"/.test(typeSource) &&
    /"handoff_prepared"[\s\S]*?"handoff_rejected"[\s\S]*?"invalid_handoff"/.test(
      typeSource,
    ) &&
    /"execute_delegated_task"/.test(typeSource);
  const hasClosedMatrix =
    source !== null &&
    /source\.status\s*===\s*"prepared"/.test(source) &&
    /source\.prepared\s*===\s*true/.test(source) &&
    /source\.reason\s*===\s*"admission_accepted"\s*&&\s*source\.progression\s*===\s*"dispatch"/.test(
      source,
    ) &&
    /source\.status\s*===\s*"rejected"/.test(source) &&
    /source\.prepared\s*===\s*false/.test(source) &&
    /source\.reason\s*===\s*"admission_rejected"/.test(source) &&
    /command\("prepared",\s*"handoff_prepared"/.test(source) &&
    /command\("rejected",\s*"handoff_rejected"/.test(source) &&
    /kind:\s*status\s*===\s*"prepared"\s*\?\s*"execute_delegated_task"\s*:\s*null/.test(
      source,
    ) &&
    /return\s+command\("rejected",\s*"invalid_handoff",\s*null\);\s*}\s*$/.test(
      source,
    ) &&
    !/if\s*\(\s*handoff\.prepared\s*\)/.test(source);
  if (!hasClosedTypes || !hasClosedMatrix)
    return Object.freeze([
      Object.freeze({
        path: WORKER_COMMAND_FILE,
        reason: "automation_worker_command_matrix_not_closed_or_fail_closed",
      }),
    ]);
  return Object.freeze([]);
}

export function inspectAutomationOrchestratorWorkerCommandIdentifiers(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, WORKER_COMMAND_FILE);
  if (source === null)
    return Object.freeze([
      Object.freeze({
        path: WORKER_COMMAND_FILE,
        reason: "automation_worker_command_file_missing",
      }),
    ]);
  const structuralSource = withoutComments(source);
  const hasIdentifierChecks =
    /source\.requestId !== null && typeof source\.requestId !== "string"/.test(
      structuralSource,
    ) &&
    /source\.delegationId !== null && typeof source\.delegationId !== "string"/.test(
      structuralSource,
    ) &&
    /source\.candidateId !== null && typeof source\.candidateId !== "string"/.test(
      structuralSource,
    ) &&
    /source\.targetId !== null && typeof source\.targetId !== "string"/.test(
      structuralSource,
    );
  const hasFalseFlags =
    /workerSelected:\s*false[\s\S]*?commandDispatched:\s*false[\s\S]*?dispatchOccurred:\s*false[\s\S]*?delegationOccurred:\s*false[\s\S]*?providerInvoked:\s*false[\s\S]*?forgeInvoked:\s*false[\s\S]*?executionStarted:\s*false/.test(
      structuralSource,
    );
  const normalizesIdentifier =
    /\.trim\(\)|\.length\s*>\s*0|\.to(?:Lower|Upper)Case\(\)/.test(
      structuralSource,
    );
  if (!hasIdentifierChecks || !hasFalseFlags || normalizesIdentifier)
    return Object.freeze([
      Object.freeze({
        path: WORKER_COMMAND_FILE,
        reason:
          "automation_worker_command_identifiers_or_operational_flags_not_fail_closed",
      }),
    ]);
  return Object.freeze([]);
}

export function inspectAutomationOrchestratorWorkerDispatchPortContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      WORKER_DISPATCH_PORT_TYPES_FILE,
      ORCHESTRATOR_BARREL_FILE,
      "./worker-dispatch-port-types.js",
      WORKER_DISPATCH_PORT_CONTRACTS,
    ),
  ];
  const implementation = sourceFor(sources, WORKER_DISPATCH_PORT_FILE);
  const orchestrator = sourceFor(sources, ORCHESTRATOR_BARREL_FILE);
  const automation = sourceFor(sources, BARREL_FILE);
  if (
    implementation === null ||
    !/export\s+function\s+prepareAutomationOrchestratorWorkerDispatchRequest\b/.test(
      withoutComments(implementation ?? ""),
    )
  )
    violations.push(
      Object.freeze({
        path: WORKER_DISPATCH_PORT_FILE,
        reason: "automation_worker_dispatch_port_function_missing",
      }),
    );
  for (const [path, source, target] of [
    [ORCHESTRATOR_BARREL_FILE, orchestrator, "./worker-dispatch-port.js"],
    [BARREL_FILE, automation, "./orchestrator/worker-dispatch-port.js"],
  ] as const)
    if (
      source === null ||
      !hasBarrelExport(
        source,
        "prepareAutomationOrchestratorWorkerDispatchRequest",
        target,
      )
    )
      violations.push(
        Object.freeze({
          path,
          reason:
            "automation_worker_dispatch_port_function_not_canonically_exported",
        }),
      );
  for (const name of WORKER_DISPATCH_PORT_CONTRACTS)
    if (
      automation === null ||
      !hasBarrelExport(automation, name, "./orchestrator/index.js")
    )
      violations.push(
        Object.freeze({
          path: BARREL_FILE,
          reason: `automation_worker_dispatch_port_type_not_canonically_exported:${name}`,
        }),
      );
  return Object.freeze(violations);
}

export function inspectAutomationOrchestratorWorkerDispatchPortPurity(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, WORKER_DISPATCH_PORT_FILE);
  const structural = source === null ? "" : withoutComments(source);
  const allowed = [
    "./worker-command-types.js",
    "./worker-dispatch-port-types.js",
  ];
  const forbidden =
    /\b(?:dispatch\s*\(|Date|Math\.random|crypto|setTimeout|setInterval|process|fs|net|http|exec|spawn|let|var)\b/;
  if (
    source === null ||
    moduleSpecifiers(structural).some((target) => !allowed.includes(target)) ||
    forbidden.test(structural) ||
    /\b(?:command|source)\.\w+\s*=(?!=)/.test(structural)
  )
    return Object.freeze([
      Object.freeze({
        path: WORKER_DISPATCH_PORT_FILE,
        reason: "automation_worker_dispatch_port_not_pure_or_dependency_safe",
      }),
    ]);
  return Object.freeze([]);
}

export function inspectAutomationOrchestratorWorkerDispatchPortMatrix(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, WORKER_DISPATCH_PORT_FILE);
  const types = sourceFor(sources, WORKER_DISPATCH_PORT_TYPES_FILE);
  const structural = source === null ? "" : withoutComments(source);
  const typeSource = types === null ? "" : withoutComments(types);
  const valid =
    /source\.status\s*===\s*"prepared"/.test(structural) &&
    /source\.reason\s*===\s*"handoff_prepared"/.test(structural) &&
    /source\.kind\s*===\s*"execute_delegated_task"/.test(structural) &&
    /request\("prepared",\s*"command_prepared"/.test(structural) &&
    /source\.status\s*===\s*"rejected"/.test(structural) &&
    /request\("rejected",\s*"command_rejected"/.test(structural) &&
    /return\s+request\("rejected",\s*"invalid_command",\s*null\);\s*}\s*$/.test(
      structural,
    ) &&
    /"command_prepared"[\s\S]*?"command_rejected"[\s\S]*?"invalid_command"/.test(
      typeSource,
    ) &&
    !/if\s*\(\s*command\.prepared\s*\)/.test(structural);
  return valid
    ? Object.freeze([])
    : Object.freeze([
        Object.freeze({
          path: WORKER_DISPATCH_PORT_FILE,
          reason:
            "automation_worker_dispatch_port_matrix_not_closed_or_fail_closed",
        }),
      ]);
}

export function inspectAutomationOrchestratorWorkerDispatchPortIdentifiers(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, WORKER_DISPATCH_PORT_FILE);
  const structural = source === null ? "" : withoutComments(source);
  const valid =
    ["requestId", "delegationId", "candidateId", "targetId"].every((name) =>
      new RegExp(
        `source\\.${name} !== null && typeof source\\.${name} !== "string"`,
      ).test(structural),
    ) &&
    /dispatchRequested:\s*false[\s\S]*?dispatchOccurred:\s*false[\s\S]*?workerSelected:\s*false[\s\S]*?providerInvoked:\s*false[\s\S]*?forgeInvoked:\s*false[\s\S]*?executionStarted:\s*false/.test(
      structural,
    ) &&
    !/\.trim\(\)|\.length\s*>\s*0|\.to(?:Lower|Upper)Case\(\)/.test(structural);
  return valid
    ? Object.freeze([])
    : Object.freeze([
        Object.freeze({
          path: WORKER_DISPATCH_PORT_FILE,
          reason:
            "automation_worker_dispatch_port_identifiers_or_operational_flags_not_fail_closed",
        }),
      ]);
}

export function inspectAutomationOrchestratorPipelineValidation(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, PIPELINE_VALIDATION_FILE);
  const barrel = sourceFor(sources, ORCHESTRATOR_BARREL_FILE);
  if (source === null) {
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_VALIDATION_FILE,
        reason: "automation_pipeline_validation_file_missing",
      }),
    ]);
  }
  const structuralSource = withoutComments(source);
  const forbidden =
    /(?:\b(?:evaluateAutomationOrchestratorDelegation|evaluateAutomationOrchestratorDelegationSelection|prepareAutomationOrchestratorDelegationDispatch)\s*\(|\bDate\.now\b|\bnew\s+Date\b|\bMath\.random\b|\bcrypto\b|\b(?:setTimeout|setInterval|queueMicrotask|requestAnimationFrame)\b|\bprocess\b|\b(?:node:)?(?:fs|net|http|https|child_process)\b|\b(?:exec|spawn)\w*\s*\(|\b(?:send|deliver|invoke|delegate|provide|forge|execute|command|callback)\s*\(|\b(?:let|var)\s+)/;
  const hasCanonicalExport =
    barrel !== null &&
    /\bvalidateAutomationOrchestratorPipeline\b/.test(
      withoutComments(barrel),
    ) &&
    withoutComments(barrel).includes('from "./pipeline-validation.js";');
  const hasProgressionAndNullabilityChecks =
    /progression\s*===\s*"evaluation"/.test(structuralSource) &&
    /progression\s*===\s*"selection"/.test(structuralSource) &&
    /progression\s*===\s*"dispatch"/.test(structuralSource) &&
    /selection\s*!==\s*null/.test(structuralSource) &&
    /dispatch\s*!==\s*null/.test(structuralSource);
  const hasFailClosedStageChecks =
    /progression\s*===\s*"evaluation"[\s\S]*?evaluation\.status\s*===\s*"eligible"/.test(
      structuralSource,
    ) &&
    /progression\s*===\s*"selection"[\s\S]*?selection\s*===\s*null[\s\S]*?selection\.status\s*===\s*"selected"/.test(
      structuralSource,
    ) &&
    /progression\s*===\s*"dispatch"[\s\S]*?evaluation\.status\s*!==\s*"eligible"[\s\S]*?selection\.status\s*!==\s*"selected"[\s\S]*?dispatch\s*===\s*null/.test(
      structuralSource,
    );
  const hasFalseOperationalFlags =
    /delegationOccurred\s*===\s*false[\s\S]*?providerInvoked\s*===\s*false[\s\S]*?forgeInvoked\s*===\s*false[\s\S]*?executionStarted\s*===\s*false/.test(
      structuralSource,
    );
  const hasIdentityChecks =
    /requestIds/.test(structuralSource) &&
    /delegationIds/.test(structuralSource) &&
    /candidateIds/.test(structuralSource) &&
    /pipeline_identity_inconsistent/.test(structuralSource);
  const hasStableDiagnostics =
    /unique\.set\(item\.code, item\)/.test(structuralSource) &&
    /\.sort\([\s\S]*?stableCompare\(left\.code, right\.code\)/.test(
      structuralSource,
    );
  if (
    !/export\s+function\s+validateAutomationOrchestratorPipeline\b/.test(
      structuralSource,
    ) ||
    !hasCanonicalExport ||
    forbidden.test(structuralSource) ||
    moduleSpecifiers(structuralSource).some(
      (target) => target !== "./pipeline-types.js",
    ) ||
    !/AutomationOrchestratorPipelineResult/.test(structuralSource) ||
    !/AutomationOrchestratorPipelineValidationResult/.test(structuralSource) ||
    !/subjectFrom\(source\)/.test(structuralSource) ||
    !/subject,/.test(structuralSource) ||
    !/status:\s*"complete"/.test(structuralSource) ||
    !/status:\s*"incomplete"/.test(structuralSource) ||
    /\bpipeline\s*===|===\s*pipeline\b/.test(structuralSource) ||
    /(?:requestId|delegationId|candidateId|targetId):\s*["']/.test(
      structuralSource,
    ) ||
    /\b(?:validation|binding)(?:Cache|Registry)\s*=\s*new\s+(?:Map|WeakMap)/.test(
      structuralSource,
    ) ||
    /type\s+(?:AutomationOrchestratorPipelineResult|PipelineValidationResult)\s*=/.test(
      structuralSource,
    ) ||
    /\bpipeline\s*(?:\.|\[)[^;]*(?<![!<>=])=(?!=)|\bpipeline\s*(?:\.|\[)[^;]*(?:\+\+|--)/.test(
      structuralSource,
    ) ||
    !hasProgressionAndNullabilityChecks ||
    !hasFailClosedStageChecks ||
    !hasFalseOperationalFlags ||
    !hasIdentityChecks ||
    !hasStableDiagnostics
  ) {
    return Object.freeze([
      Object.freeze({
        path: PIPELINE_VALIDATION_FILE,
        reason: "automation_pipeline_validation_not_pure_or_fail_closed",
      }),
    ]);
  }
  return Object.freeze([]);
}

export function inspectAutomationProviderContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      PROVIDER_TYPES_FILE,
      PROVIDER_BARREL_FILE,
      "./types.js",
      PROVIDER_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, PROVIDER_TYPES_FILE);
  const structuralSource = source === null ? null : withoutComments(source);

  if (
    structuralSource !== null &&
    (/(?:\bclass\b|\bfunction\b|=>)/.test(structuralSource) ||
      moduleSpecifiers(structuralSource).some(
        (target) => target !== "../types.js",
      ))
  ) {
    violations.push(
      Object.freeze({
        path: PROVIDER_TYPES_FILE,
        reason: "provider_contract_contains_concrete_or_vendor_dependency",
      }),
    );
  }

  return Object.freeze(violations);
}

export function inspectAutomationForgeContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      FORGE_TYPES_FILE,
      FORGE_BARREL_FILE,
      "./types.js",
      FORGE_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, FORGE_TYPES_FILE);
  const structuralSource = source === null ? null : withoutComments(source);

  if (
    structuralSource !== null &&
    (/(?:\bclass\b|\bfunction\b|=>)/.test(structuralSource) ||
      moduleSpecifiers(structuralSource).some(
        (target) => target !== "../types.js",
      ))
  ) {
    violations.push(
      Object.freeze({
        path: FORGE_TYPES_FILE,
        reason: "forge_contract_contains_concrete_or_vendor_dependency",
      }),
    );
  }

  return Object.freeze(violations);
}

export function inspectAutomationPolicyContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      POLICY_TYPES_FILE,
      POLICY_BARREL_FILE,
      "./types.js",
      POLICY_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, POLICY_TYPES_FILE);
  const structuralSource = source === null ? null : withoutComments(source);

  if (
    structuralSource !== null &&
    (/(?:\bclass\b|\bfunction\b|=>|\bswitch\s*\()/.test(structuralSource) ||
      moduleSpecifiers(structuralSource).some(
        (target) => target !== "../types.js",
      ))
  ) {
    violations.push(
      Object.freeze({
        path: POLICY_TYPES_FILE,
        reason:
          "policy_contract_contains_evaluator_implementation_or_rules_engine",
      }),
    );
  }

  return Object.freeze(violations);
}

export function inspectAutomationAssemblyContracts(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations = [
    ...violationsForContracts(
      sources,
      ASSEMBLY_TYPES_FILE,
      ASSEMBLY_BARREL_FILE,
      "./types.js",
      ASSEMBLY_CONTRACTS,
    ),
  ];
  const source = sourceFor(sources, ASSEMBLY_TYPES_FILE);
  const structuralSource = source === null ? null : withoutComments(source);

  if (
    structuralSource === null ||
    !/AutomationApplicationDependencies[\s\S]*providerSelector[\s\S]*forgeSelector[\s\S]*policyEvaluator/.test(
      structuralSource,
    ) ||
    !/AutomationApplicationAssembly[\s\S]*configuration[\s\S]*dependencies[\s\S]*registry[\s\S]*policy[\s\S]*selection/.test(
      structuralSource,
    )
  ) {
    violations.push(
      Object.freeze({
        path: ASSEMBLY_TYPES_FILE,
        reason: "assembly_dependencies_not_explicit",
      }),
    );
  }

  return Object.freeze(violations);
}

export function inspectAutomationAssemblyInertness(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, ASSEMBLY_TYPES_FILE);
  if (
    source !== null &&
    /(?:\bclass\b|\bfunction\b|=>|\bnew\s+|\bObject\.freeze\b)/.test(
      withoutComments(source),
    )
  ) {
    return Object.freeze([
      Object.freeze({
        path: ASSEMBLY_TYPES_FILE,
        reason: "assembly_contract_contains_runtime_composition",
      }),
    ]);
  }

  return Object.freeze([]);
}

export function inspectAutomationPurity(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations: AutomationAuditViolation[] = [];
  const forbidden =
    /(?:\bprocess\b|\bfetch\b|\brequire\b|\bexec(?:File|Sync)?\b|\bspawn(?:Sync)?\b|\breadFileSync\b|\bwriteFileSync\b|\b(?:node:)?(?:fs|child_process|net|http|https|path|os)\b|\b(?:let|var)\s+)/;

  for (const source of sources) {
    if (!source.path.startsWith(`${AUTOMATION_ROOT}/`)) continue;
    if (forbidden.test(withoutComments(source.source))) {
      violations.push(
        Object.freeze({
          path: source.path,
          reason: "automation_contract_contains_effect_or_mutable_global",
        }),
      );
    }
  }

  return Object.freeze(violations);
}

export function inspectAutomationDependencyDirection(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations: AutomationAuditViolation[] = [];
  const expectedImports = new Map<string, readonly string[]>([
    [CORE_FILE, []],
    [
      BARREL_FILE,
      [
        "./types.js",
        "./provider/index.js",
        "./forge/index.js",
        "./policy/index.js",
        "./assembly/index.js",
        "./orchestrator/index.js",
        "./orchestrator/pipeline-summary.js",
        "./orchestrator/pipeline-admission.js",
        "./orchestrator/pipeline-worker-handoff.js",
        "./orchestrator/worker-command.js",
        "./orchestrator/worker-dispatch-port.js",
      ],
    ],
    [PROVIDER_TYPES_FILE, ["../types.js"]],
    [PROVIDER_BARREL_FILE, ["./types.js"]],
    [FORGE_TYPES_FILE, ["../types.js"]],
    [FORGE_BARREL_FILE, ["./types.js"]],
    [POLICY_TYPES_FILE, ["../types.js"]],
    [POLICY_BARREL_FILE, ["./types.js"]],
    [
      ASSEMBLY_TYPES_FILE,
      [
        "../types.js",
        "../provider/index.js",
        "../forge/index.js",
        "../policy/index.js",
      ],
    ],
    [ASSEMBLY_BARREL_FILE, ["./types.js"]],
    [
      ORCHESTRATOR_TYPES_FILE,
      [
        "../types.js",
        "../assembly/index.js",
        "../forge/index.js",
        "../policy/index.js",
        "../provider/index.js",
      ],
    ],
    [
      ORCHESTRATOR_BARREL_FILE,
      [
        "./types.js",
        "./evaluation/index.js",
        "./planning/index.js",
        "./delegation/index.js",
        "./delegation-evaluation/index.js",
        "./delegation-selection/index.js",
        "./delegation-dispatch/index.js",
        "./pipeline.js",
        "./pipeline-types.js",
        "./pipeline-validation.js",
        "./pipeline-summary.js",
        "./pipeline-summary-types.js",
        "./pipeline-admission.js",
        "./pipeline-admission-types.js",
        "./pipeline-worker-handoff.js",
        "./pipeline-worker-handoff-types.js",
        "./worker-command.js",
        "./worker-command-types.js",
        "./worker-dispatch-port.js",
        "./worker-dispatch-port-types.js",
      ],
    ],
    [
      PIPELINE_FILE,
      [
        "./delegation-evaluation/index.js",
        "./delegation-selection/index.js",
        "./delegation-dispatch/index.js",
        "./pipeline-types.js",
      ],
    ],
    [
      PIPELINE_TYPES_FILE,
      [
        "./delegation-evaluation/index.js",
        "./delegation-selection/index.js",
        "./delegation-dispatch/index.js",
      ],
    ],
    [PIPELINE_SUMMARY_TYPES_FILE, ["./pipeline-types.js"]],
    [
      PIPELINE_SUMMARY_FILE,
      ["./pipeline-types.js", "./pipeline-summary-types.js"],
    ],
    [PIPELINE_VALIDATION_FILE, ["./pipeline-types.js"]],
    [PIPELINE_ADMISSION_TYPES_FILE, ["./pipeline-types.js"]],
    [
      PIPELINE_ADMISSION_FILE,
      ["./pipeline-summary-types.js", "./pipeline-admission-types.js"],
    ],
    [PIPELINE_WORKER_HANDOFF_TYPES_FILE, []],
    [
      PIPELINE_WORKER_HANDOFF_FILE,
      ["./pipeline-admission-types.js", "./pipeline-worker-handoff-types.js"],
    ],
    [WORKER_COMMAND_TYPES_FILE, []],
    [
      WORKER_COMMAND_FILE,
      ["./pipeline-worker-handoff-types.js", "./worker-command-types.js"],
    ],
    [WORKER_DISPATCH_PORT_TYPES_FILE, []],
    [
      WORKER_DISPATCH_PORT_FILE,
      ["./worker-command-types.js", "./worker-dispatch-port-types.js"],
    ],
    [
      PLANNING_TYPES_FILE,
      [
        "../../types.js",
        "../index.js",
        "../evaluation/index.js",
        "../../policy/index.js",
      ],
    ],
    [PLANNING_BARREL_FILE, ["./types.js"]],
    [
      DELEGATION_TYPES_FILE,
      [
        "../../types.js",
        "../index.js",
        "../evaluation/index.js",
        "../planning/index.js",
        "../../forge/index.js",
        "../../policy/index.js",
        "../../provider/index.js",
      ],
    ],
    [DELEGATION_BARREL_FILE, ["./types.js"]],
    [
      DELEGATION_EVALUATION_TYPES_FILE,
      [
        "../../types.js",
        "../index.js",
        "../delegation/index.js",
        "../evaluation/index.js",
        "../planning/index.js",
        "../../policy/index.js",
      ],
    ],
    [DELEGATION_EVALUATION_BARREL_FILE, ["./types.js", "./evaluation.js"]],
    [
      DELEGATION_EVALUATION_IMPLEMENTATION_FILE,
      [
        "../../types.js",
        "../../policy/index.js",
        "../delegation/index.js",
        "./types.js",
      ],
    ],
    [
      DELEGATION_SELECTION_TYPES_FILE,
      [
        "../../types.js",
        "../index.js",
        "../delegation/index.js",
        "../delegation-evaluation/index.js",
        "../evaluation/index.js",
        "../planning/index.js",
        "../../policy/index.js",
      ],
    ],
    [DELEGATION_SELECTION_BARREL_FILE, ["./types.js", "./evaluation.js"]],
    [
      DELEGATION_SELECTION_IMPLEMENTATION_FILE,
      [
        "../../types.js",
        "../delegation/index.js",
        "../delegation-evaluation/index.js",
        "./types.js",
      ],
    ],
    [
      DELEGATION_DISPATCH_TYPES_FILE,
      [
        "../../types.js",
        "../index.js",
        "../delegation/index.js",
        "../delegation-evaluation/index.js",
        "../delegation-selection/index.js",
        "../evaluation/index.js",
        "../planning/index.js",
        "../../policy/index.js",
      ],
    ],
    [DELEGATION_DISPATCH_BARREL_FILE, ["./types.js", "./preparation.js"]],
    [DELEGATION_DISPATCH_PREPARATION_FILE, ["../../types.js", "./types.js"]],
    [
      EVALUATION_TYPES_FILE,
      ["../../types.js", "../index.js", "../../policy/index.js"],
    ],
    [EVALUATION_BARREL_FILE, ["./types.js"]],
  ]);

  for (const [path, expected] of expectedImports) {
    const source = sourceFor(sources, path);
    if (source === null) continue;
    const actual = [...new Set(moduleSpecifiers(source))];
    if (
      actual.length !== expected.length ||
      actual.some((target) => !expected.includes(target))
    ) {
      violations.push(
        Object.freeze({
          path,
          reason: "automation_dependency_direction_violation",
        }),
      );
    }
  }

  return Object.freeze(violations);
}

export function inspectAutomationForbiddenDependencies(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const violations: AutomationAuditViolation[] = [];
  const forbidden =
    /(?:^|\/)(?:core|composition|runtime|commands|adapters?)(?:\/|$)/;

  for (const source of sources) {
    if (!source.path.startsWith(`${AUTOMATION_ROOT}/`)) continue;
    for (const target of moduleSpecifiers(source.source)) {
      if (!forbidden.test(target)) continue;
      violations.push(
        Object.freeze({
          path: source.path,
          reason: `forbidden_automation_dependency:${target}`,
        }),
      );
    }
  }

  return Object.freeze(violations);
}

export function inspectAutomationAuditDocumentation(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  const source = sourceFor(sources, AUTOMATION_RFC_FILE);
  const required = [
    "Deterministic audit enforcement",
    "AUDIT-503",
    "AUDIT-512",
  ];

  if (source === null) {
    return Object.freeze([
      Object.freeze({
        path: AUTOMATION_RFC_FILE,
        reason: "automation_audit_documentation_missing",
      }),
    ]);
  }

  return Object.freeze(
    required
      .filter((token) => !source.includes(token))
      .map((token) =>
        Object.freeze({
          path: AUTOMATION_RFC_FILE,
          reason: `automation_audit_documentation_missing:${token}`,
        }),
      ),
  );
}

function repositoryAutomationSources(): readonly AutomationAuditSource[] {
  return Object.freeze(
    [...REQUIRED_FILES, AUTOMATION_RFC_FILE]
      .filter((path) => existsSync(path))
      .map((path) =>
        Object.freeze({
          path,
          source: readFileSync(path, "utf8"),
        }),
      ),
  );
}

function createRule(
  id: string,
  title: string,
  description: string,
  inspect: (
    sources: readonly AutomationAuditSource[],
  ) => readonly AutomationAuditViolation[],
  category: AuditRule["category"] = "architecture",
): AuditRule {
  const rule: AuditRule = {
    id,
    category,
    severity: "error",
    title,
    description,
    metadata: {
      introducedIn: "V18.7",
      tags:
        category === "docs"
          ? ["documentation", "architecture", "contract"]
          : ["architecture", "contract", "ci"],
      stability: "stable",
      dependsOn: [],
    },
    check: () => {
      const details = inspect(repositoryAutomationSources()).map(
        ({ path, reason }) => `${path}: ${reason}`,
      );

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Keep Automation contracts declarative, isolated, and exported through the canonical public barrel.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze([...REQUIRED_FILES]));
    },
  };

  return rule;
}

export const AUTOMATION_CORE_CONTRACTS_RULE = createRule(
  "AUDIT-503",
  "Automation Core contracts are complete and canonically exported",
  "Automation Core contracts exist and src/automation/index.ts exports the complete public Automation surface.",
  inspectAutomationCoreContracts,
);

export const AUTOMATION_PROVIDER_CONTRACTS_RULE = createRule(
  "AUDIT-504",
  "Automation Provider contracts remain abstract and provider-agnostic",
  "Provider contracts expose the required public names and contain neither concrete code nor vendor dependencies.",
  inspectAutomationProviderContracts,
);

export const AUTOMATION_FORGE_CONTRACTS_RULE = createRule(
  "AUDIT-505",
  "Automation Forge contracts remain abstract and forge-agnostic",
  "Forge contracts expose the required public names and contain neither concrete code nor vendor dependencies.",
  inspectAutomationForgeContracts,
);

export const AUTOMATION_POLICY_CONTRACTS_RULE = createRule(
  "AUDIT-506",
  "Automation Policy contracts contain no evaluator implementation",
  "Policy contracts expose the required public names without a rules engine or evaluator implementation.",
  inspectAutomationPolicyContracts,
);

export const AUTOMATION_ASSEMBLY_CONTRACTS_RULE = createRule(
  "AUDIT-507",
  "Automation Application Assembly dependencies are explicit",
  "Assembly contracts expose all required public names and declare provider, forge, and policy dependencies explicitly.",
  inspectAutomationAssemblyContracts,
);

export const AUTOMATION_ASSEMBLY_INERTNESS_RULE = createRule(
  "AUDIT-508",
  "Automation Application Assembly has no runtime composition behavior",
  "Assembly contracts contain no runtime assembly function, concrete composition, or mutable construction behavior.",
  inspectAutomationAssemblyInertness,
);

export const AUTOMATION_CONTRACT_PURITY_RULE = createRule(
  "AUDIT-509",
  "Automation contracts remain side-effect free and immutable",
  "Automation contracts contain no filesystem, network, process, environment, command execution, or mutable global usage.",
  inspectAutomationPurity,
);

export const AUTOMATION_DEPENDENCY_DIRECTION_RULE = createRule(
  "AUDIT-510",
  "Automation contract dependency direction is preserved",
  "Core has no Automation imports; Provider, Forge, and Policy depend only on Core; Assembly depends only on public Automation contracts.",
  inspectAutomationDependencyDirection,
);

export const AUTOMATION_FORBIDDEN_DEPENDENCIES_RULE = createRule(
  "AUDIT-511",
  "Automation contracts do not depend on application internals",
  "Automation contracts do not import Core, Composition, Runtime, commands, or concrete adapters.",
  inspectAutomationForbiddenDependencies,
);

export const AUTOMATION_AUDIT_DOCUMENTATION_RULE = createRule(
  "AUDIT-512",
  "Automation deterministic audit enforcement is documented",
  "RFC-0001 documents the deterministic Automation audit family and its registered rule range.",
  inspectAutomationAuditDocumentation,
  "docs",
);

export const AUTOMATION_PIPELINE_ADMISSION_CONTRACTS_RULE = createRule(
  "AUDIT-514",
  "Automation Pipeline Admission contracts and exports are complete",
  "Pipeline Admission files, public contracts, canonical function, and public-barrel exports are present.",
  inspectAutomationOrchestratorPipelineAdmissionContracts,
);

export const AUTOMATION_PIPELINE_ADMISSION_PURITY_RULE = createRule(
  "AUDIT-515",
  "Automation Pipeline Admission remains pure and dependency-safe",
  "Pipeline Admission imports only public summary contracts and contains no operational dependency, effect, mutable state, or input mutation.",
  inspectAutomationOrchestratorPipelineAdmissionPurity,
);

export const AUTOMATION_PIPELINE_ADMISSION_MATRIX_RULE = createRule(
  "AUDIT-516",
  "Automation Pipeline Admission uses a closed fail-closed matrix",
  "Pipeline Admission recognizes only the declared evaluation, selection, and dispatch outcomes and admits only prepared dispatch.",
  inspectAutomationOrchestratorPipelineAdmissionMatrix,
);

export const AUTOMATION_PIPELINE_ADMISSION_IDENTIFIERS_RULE = createRule(
  "AUDIT-517",
  "Automation Pipeline Admission preserves identifier and operational invariants",
  "Pipeline Admission validates present optional identifiers without normalization and keeps every operational flag literally false.",
  inspectAutomationOrchestratorPipelineAdmissionIdentifiers,
);

export const AUTOMATION_PIPELINE_WORKER_HANDOFF_CONTRACTS_RULE = createRule(
  "AUDIT-518",
  "Automation Pipeline Worker Handoff contracts and exports are complete",
  "Pipeline Worker Handoff files, public contracts, canonical function, and public-barrel exports are present.",
  inspectAutomationOrchestratorPipelineWorkerHandoffContracts,
);

export const AUTOMATION_PIPELINE_WORKER_HANDOFF_PURITY_RULE = createRule(
  "AUDIT-519",
  "Automation Pipeline Worker Handoff remains pure and dependency-safe",
  "Pipeline Worker Handoff imports only the public Admission contract and contains no operational dependency, effect, mutable state, or input mutation.",
  inspectAutomationOrchestratorPipelineWorkerHandoffPurity,
);

export const AUTOMATION_PIPELINE_WORKER_HANDOFF_MATRIX_RULE = createRule(
  "AUDIT-520",
  "Automation Pipeline Worker Handoff uses a closed fail-closed matrix",
  "Pipeline Worker Handoff prepares only a coherent admitted dispatch and rejects every contradictory admission.",
  inspectAutomationOrchestratorPipelineWorkerHandoffMatrix,
);

export const AUTOMATION_PIPELINE_WORKER_HANDOFF_IDENTIFIERS_RULE = createRule(
  "AUDIT-521",
  "Automation Pipeline Worker Handoff preserves identifier and operational invariants",
  "Pipeline Worker Handoff validates all prepared identifiers without normalization and keeps every handoff and operational flag literally false.",
  inspectAutomationOrchestratorPipelineWorkerHandoffIdentifiers,
);

export const AUTOMATION_WORKER_COMMAND_CONTRACTS_RULE = createRule(
  "AUDIT-522",
  "Automation Worker Command contracts and exports are complete",
  "Worker Command files, public contracts, canonical function, and public-barrel exports are present.",
  inspectAutomationOrchestratorWorkerCommandContracts,
);

export const AUTOMATION_WORKER_COMMAND_PURITY_RULE = createRule(
  "AUDIT-523",
  "Automation Worker Command remains pure and dependency-safe",
  "Worker Command imports only the public Worker Handoff contract and contains no operational dependency, effect, mutable state, or input mutation.",
  inspectAutomationOrchestratorWorkerCommandPurity,
);

export const AUTOMATION_WORKER_COMMAND_MATRIX_RULE = createRule(
  "AUDIT-524",
  "Automation Worker Command uses a closed fail-closed matrix",
  "Worker Command prepares only a coherent prepared handoff and rejects every contradictory handoff.",
  inspectAutomationOrchestratorWorkerCommandMatrix,
);

export const AUTOMATION_WORKER_COMMAND_IDENTIFIERS_RULE = createRule(
  "AUDIT-525",
  "Automation Worker Command preserves identifier and operational invariants",
  "Worker Command validates prepared identifiers without normalization and keeps every command and operational flag literally false.",
  inspectAutomationOrchestratorWorkerCommandIdentifiers,
);
export const AUTOMATION_WORKER_DISPATCH_PORT_CONTRACTS_RULE = createRule(
  "AUDIT-526",
  "Automation Worker Dispatch Port contracts and exports are complete",
  "Worker Dispatch Port contracts, function, and canonical exports are present.",
  inspectAutomationOrchestratorWorkerDispatchPortContracts,
);
export const AUTOMATION_WORKER_DISPATCH_PORT_PURITY_RULE = createRule(
  "AUDIT-527",
  "Automation Worker Dispatch Port remains pure and dependency-safe",
  "Worker Dispatch Port preparation is pure and never invokes the port.",
  inspectAutomationOrchestratorWorkerDispatchPortPurity,
);
export const AUTOMATION_WORKER_DISPATCH_PORT_MATRIX_RULE = createRule(
  "AUDIT-528",
  "Automation Worker Dispatch Port uses a closed fail-closed matrix",
  "Worker Dispatch Port prepares only coherent Worker Commands.",
  inspectAutomationOrchestratorWorkerDispatchPortMatrix,
);
export const AUTOMATION_WORKER_DISPATCH_PORT_IDENTIFIERS_RULE = createRule(
  "AUDIT-529",
  "Automation Worker Dispatch Port preserves identifier and operational invariants",
  "Worker Dispatch Port preserves identifiers exactly and request flags remain false.",
  inspectAutomationOrchestratorWorkerDispatchPortIdentifiers,
);
