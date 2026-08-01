import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  AUTOMATION_ASSEMBLY_CONTRACTS_RULE,
  AUTOMATION_ASSEMBLY_INERTNESS_RULE,
  AUTOMATION_AUDIT_DOCUMENTATION_RULE,
  AUTOMATION_CONTRACT_PURITY_RULE,
  AUTOMATION_CORE_CONTRACTS_RULE,
  AUTOMATION_DEPENDENCY_DIRECTION_RULE,
  AUTOMATION_FORBIDDEN_DEPENDENCIES_RULE,
  AUTOMATION_FORGE_CONTRACTS_RULE,
  AUTOMATION_POLICY_CONTRACTS_RULE,
  AUTOMATION_PIPELINE_ADMISSION_CONTRACTS_RULE,
  AUTOMATION_PIPELINE_ADMISSION_IDENTIFIERS_RULE,
  AUTOMATION_PIPELINE_ADMISSION_MATRIX_RULE,
  AUTOMATION_PIPELINE_ADMISSION_PURITY_RULE,
  AUTOMATION_PIPELINE_WORKER_HANDOFF_CONTRACTS_RULE,
  AUTOMATION_PIPELINE_WORKER_HANDOFF_IDENTIFIERS_RULE,
  AUTOMATION_PIPELINE_WORKER_HANDOFF_MATRIX_RULE,
  AUTOMATION_PIPELINE_WORKER_HANDOFF_PURITY_RULE,
  AUTOMATION_PROVIDER_CONTRACTS_RULE,
  inspectAutomationAssemblyContracts,
  inspectAutomationAssemblyInertness,
  inspectAutomationAuditDocumentation,
  inspectAutomationContractConsistency,
  inspectAutomationCoreContracts,
  inspectAutomationDependencyDirection,
  inspectAutomationForbiddenDependencies,
  inspectAutomationForgeContracts,
  inspectAutomationOrchestratorEvaluationContracts,
  inspectAutomationOrchestratorDelegationContracts,
  inspectAutomationOrchestratorDelegationEvaluationContracts,
  inspectAutomationOrchestratorDelegationEvaluationImplementation,
  inspectAutomationOrchestratorDelegationSelectionContracts,
  inspectAutomationOrchestratorDelegationSelectionImplementation,
  inspectAutomationOrchestratorDelegationDispatchContracts,
  inspectAutomationOrchestratorDelegationDispatchPreparation,
  inspectAutomationOrchestratorPlanningContracts,
  inspectAutomationOrchestratorPipeline,
  inspectAutomationOrchestratorPipelineContracts,
  inspectAutomationOrchestratorPipelineAdmissionContracts,
  inspectAutomationOrchestratorPipelineAdmissionIdentifiers,
  inspectAutomationOrchestratorPipelineAdmissionMatrix,
  inspectAutomationOrchestratorPipelineAdmissionPurity,
  inspectAutomationOrchestratorPipelineWorkerHandoffContracts,
  inspectAutomationOrchestratorPipelineWorkerHandoffIdentifiers,
  inspectAutomationOrchestratorPipelineWorkerHandoffMatrix,
  inspectAutomationOrchestratorPipelineWorkerHandoffPurity,
  inspectAutomationOrchestratorPipelineValidation,
  inspectAutomationPolicyContracts,
  inspectAutomationProviderContracts,
  inspectAutomationPurity,
  type AutomationAuditViolation,
  type AutomationAuditSource,
} from "../../src/audit/rules/automation-contracts.js";
import { selectAuditRulesForProfile } from "../../src/audit/profiles.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

const AUTOMATION_PATHS = [
  "src/automation/types.ts",
  "src/automation/index.ts",
  "src/automation/provider/types.ts",
  "src/automation/provider/index.ts",
  "src/automation/forge/types.ts",
  "src/automation/forge/index.ts",
  "src/automation/policy/types.ts",
  "src/automation/policy/index.ts",
  "src/automation/assembly/types.ts",
  "src/automation/assembly/index.ts",
  "src/automation/orchestrator/types.ts",
  "src/automation/orchestrator/index.ts",
  "src/automation/orchestrator/pipeline.ts",
  "src/automation/orchestrator/pipeline-types.ts",
  "src/automation/orchestrator/pipeline-validation.ts",
  "src/automation/orchestrator/pipeline-summary-types.ts",
  "src/automation/orchestrator/pipeline-summary.ts",
  "src/automation/orchestrator/pipeline-admission-types.ts",
  "src/automation/orchestrator/pipeline-admission.ts",
  "src/automation/orchestrator/pipeline-worker-handoff-types.ts",
  "src/automation/orchestrator/pipeline-worker-handoff.ts",
  "src/automation/orchestrator/evaluation/types.ts",
  "src/automation/orchestrator/evaluation/index.ts",
  "src/automation/orchestrator/planning/types.ts",
  "src/automation/orchestrator/planning/index.ts",
  "src/automation/orchestrator/delegation/types.ts",
  "src/automation/orchestrator/delegation/index.ts",
  "src/automation/orchestrator/delegation-evaluation/types.ts",
  "src/automation/orchestrator/delegation-evaluation/index.ts",
  "src/automation/orchestrator/delegation-evaluation/evaluation.ts",
  "src/automation/orchestrator/delegation-selection/types.ts",
  "src/automation/orchestrator/delegation-selection/index.ts",
  "src/automation/orchestrator/delegation-selection/evaluation.ts",
  "src/automation/orchestrator/delegation-dispatch/types.ts",
  "src/automation/orchestrator/delegation-dispatch/index.ts",
  "src/automation/orchestrator/delegation-dispatch/preparation.ts",
  "docs/architecture/rfc/0001-automation-platform.md",
] as const;

function sources(
  replacement?: Readonly<{ path: string; source: string }>,
): readonly AutomationAuditSource[] {
  return Object.freeze(
    AUTOMATION_PATHS.map((path) =>
      Object.freeze({
        path,
        source:
          replacement?.path === path
            ? replacement.source
            : readFileSync(path, "utf8"),
      }),
    ),
  );
}

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function countOccurrences(sourceText: string, pattern: string): number {
  return sourceText.split(pattern).length - 1;
}

function replaceOccurrence(
  sourceText: string,
  pattern: string,
  replacement: string,
  expectedOccurrences = 1,
  occurrence = 1,
): string {
  assert.equal(
    countOccurrences(sourceText, pattern),
    expectedOccurrences,
    `expected ${expectedOccurrences} occurrence(s) of ${JSON.stringify(pattern)}`,
  );

  let currentOccurrence = 0;
  const mutated = sourceText.replaceAll(pattern, (match) => {
    currentOccurrence += 1;
    return currentOccurrence === occurrence ? replacement : match;
  });

  assert.notEqual(
    mutated,
    sourceText,
    "the requested mutation was not applied",
  );
  return mutated;
}

function mutatedSources(
  path: string,
  pattern: string,
  replacement: string,
  expectedOccurrences = 1,
  occurrence = 1,
): readonly AutomationAuditSource[] {
  return sources({
    path,
    source: replaceOccurrence(
      source(path),
      pattern,
      replacement,
      expectedOccurrences,
      occurrence,
    ),
  });
}

function sourcesWithout(path: string): readonly AutomationAuditSource[] {
  assert.equal(AUTOMATION_PATHS.includes(path as never), true);
  return Object.freeze(sources().filter((entry) => entry.path !== path));
}

function assertRuleRejects(
  rule: Readonly<{ id: string }>,
  violations: readonly AutomationAuditViolation[],
  expectedReason: string,
  label = expectedReason,
): void {
  assert.equal(
    violations.some((violation) => violation.reason === expectedReason),
    true,
    `${rule.id} did not reject the intended mutation: ${label}`,
  );
}

test("Automation contract inspectors accept the repository contract surface", () => {
  const fixture = sources();

  assert.deepEqual(inspectAutomationCoreContracts(fixture), []);
  assert.deepEqual(inspectAutomationOrchestratorPipeline(fixture), []);
  assert.deepEqual(inspectAutomationOrchestratorPipelineContracts(fixture), []);
  assert.deepEqual(
    inspectAutomationOrchestratorPipelineValidation(fixture),
    [],
  );
  assert.deepEqual(inspectAutomationContractConsistency(fixture), []);
  assert.deepEqual(
    inspectAutomationOrchestratorEvaluationContracts(fixture),
    [],
  );
  assert.deepEqual(inspectAutomationOrchestratorPlanningContracts(fixture), []);
  assert.deepEqual(
    inspectAutomationOrchestratorDelegationContracts(fixture),
    [],
  );
  assert.deepEqual(
    inspectAutomationOrchestratorDelegationEvaluationContracts(fixture),
    [],
  );
  assert.deepEqual(
    inspectAutomationOrchestratorDelegationEvaluationImplementation(fixture),
    [],
  );
  assert.deepEqual(
    inspectAutomationOrchestratorDelegationSelectionContracts(fixture),
    [],
  );
  assert.deepEqual(
    inspectAutomationOrchestratorDelegationSelectionImplementation(fixture),
    [],
  );
  assert.deepEqual(
    inspectAutomationOrchestratorDelegationDispatchContracts(fixture),
    [],
  );
  assert.deepEqual(
    inspectAutomationOrchestratorDelegationDispatchPreparation(fixture),
    [],
  );
  assert.deepEqual(inspectAutomationProviderContracts(fixture), []);
  assert.deepEqual(inspectAutomationForgeContracts(fixture), []);
  assert.deepEqual(inspectAutomationPolicyContracts(fixture), []);
  assert.deepEqual(inspectAutomationAssemblyContracts(fixture), []);
  assert.deepEqual(inspectAutomationAssemblyInertness(fixture), []);
  assert.deepEqual(inspectAutomationPurity(fixture), []);
  assert.deepEqual(inspectAutomationDependencyDirection(fixture), []);
  assert.deepEqual(inspectAutomationForbiddenDependencies(fixture), []);
  assert.deepEqual(inspectAutomationAuditDocumentation(fixture), []);
});

test("AUDIT-514 through AUDIT-517 are registered, executed, and passing", () => {
  const fixture = sources();
  const rules = [
    AUTOMATION_PIPELINE_ADMISSION_CONTRACTS_RULE,
    AUTOMATION_PIPELINE_ADMISSION_PURITY_RULE,
    AUTOMATION_PIPELINE_ADMISSION_MATRIX_RULE,
    AUTOMATION_PIPELINE_ADMISSION_IDENTIFIERS_RULE,
  ];
  const expectedIds = ["AUDIT-514", "AUDIT-515", "AUDIT-516", "AUDIT-517"];

  assert.deepEqual(
    [
      inspectAutomationOrchestratorPipelineAdmissionContracts(fixture),
      inspectAutomationOrchestratorPipelineAdmissionPurity(fixture),
      inspectAutomationOrchestratorPipelineAdmissionMatrix(fixture),
      inspectAutomationOrchestratorPipelineAdmissionIdentifiers(fixture),
    ],
    [[], [], [], []],
  );
  assert.deepEqual(
    rules.map((rule) => rule.id),
    expectedIds,
  );
  for (const rule of rules) {
    assert.equal(
      AUDIT_RULES.find(({ id }) => id === rule.id)?.title,
      rule.title,
    );
    assert.equal(rule.check().status, "pass");
  }
});

test("AUDIT-518 through AUDIT-521 are registered, executed, and passing", () => {
  const fixture = sources();
  const rules = [
    AUTOMATION_PIPELINE_WORKER_HANDOFF_CONTRACTS_RULE,
    AUTOMATION_PIPELINE_WORKER_HANDOFF_PURITY_RULE,
    AUTOMATION_PIPELINE_WORKER_HANDOFF_MATRIX_RULE,
    AUTOMATION_PIPELINE_WORKER_HANDOFF_IDENTIFIERS_RULE,
  ];
  const expectedIds = ["AUDIT-518", "AUDIT-519", "AUDIT-520", "AUDIT-521"];

  assert.deepEqual(
    [
      inspectAutomationOrchestratorPipelineWorkerHandoffContracts(fixture),
      inspectAutomationOrchestratorPipelineWorkerHandoffPurity(fixture),
      inspectAutomationOrchestratorPipelineWorkerHandoffMatrix(fixture),
      inspectAutomationOrchestratorPipelineWorkerHandoffIdentifiers(fixture),
    ],
    [[], [], [], []],
  );
  assert.deepEqual(
    rules.map((rule) => rule.id),
    expectedIds,
  );
  for (const rule of rules) {
    assert.equal(
      AUDIT_RULES.find(({ id }) => id === rule.id)?.title,
      rule.title,
    );
    assert.equal(rule.check().status, "pass");
  }
});

test("AUDIT-518 through AUDIT-521 reject Worker Handoff regressions", () => {
  const typesPath =
    "src/automation/orchestrator/pipeline-worker-handoff-types.ts";
  const implementationPath =
    "src/automation/orchestrator/pipeline-worker-handoff.ts";
  const orchestratorBarrelPath = "src/automation/orchestrator/index.ts";
  const automationBarrelPath = "src/automation/index.ts";
  const checks = [
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_CONTRACTS_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffContracts,
      sourcesWithout(typesPath),
      "required_file_missing",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_CONTRACTS_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffContracts,
      mutatedSources(
        implementationPath,
        "export function prepareAutomationOrchestratorPipelineWorkerHandoff",
        "function prepareAutomationOrchestratorPipelineWorkerHandoff",
      ),
      "automation_pipeline_worker_handoff_function_missing",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_CONTRACTS_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffContracts,
      mutatedSources(
        orchestratorBarrelPath,
        'export { prepareAutomationOrchestratorPipelineWorkerHandoff } from "./pipeline-worker-handoff.js";',
        'export {} from "./pipeline-worker-handoff.js";',
      ),
      "automation_pipeline_worker_handoff_function_not_canonically_exported",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_CONTRACTS_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffContracts,
      mutatedSources(
        typesPath,
        "export type AutomationOrchestratorPipelineHandoffReason",
        "type AutomationOrchestratorPipelineHandoffReason",
      ),
      "missing_public_contract:AutomationOrchestratorPipelineHandoffReason",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_CONTRACTS_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffContracts,
      mutatedSources(
        automationBarrelPath,
        'export { prepareAutomationOrchestratorPipelineWorkerHandoff } from "./orchestrator/pipeline-worker-handoff.js";',
        'export {} from "./orchestrator/pipeline-worker-handoff.js";',
      ),
      "automation_pipeline_worker_handoff_function_not_canonically_exported",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_PURITY_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffPurity,
      mutatedSources(implementationPath, "\n}", "\n}\nDate.now();", 7, 7),
      "automation_pipeline_worker_handoff_not_pure_or_dependency_safe",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_PURITY_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffPurity,
      mutatedSources(implementationPath, "\n}", "\n}\nMath.random();", 7, 7),
      "automation_pipeline_worker_handoff_not_pure_or_dependency_safe",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_PURITY_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffPurity,
      mutatedSources(implementationPath, "\n}", "\n}\nprocess.cwd();", 7, 7),
      "automation_pipeline_worker_handoff_not_pure_or_dependency_safe",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_PURITY_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffPurity,
      mutatedSources(
        implementationPath,
        "\n}",
        '\n}\nimport type { Provider } from "../provider/index.js";',
        7,
        7,
      ),
      "automation_pipeline_worker_handoff_not_pure_or_dependency_safe",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_PURITY_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffPurity,
      mutatedSources(
        implementationPath,
        "\n}",
        '\n}\nadmission.status = "admitted";',
        7,
        7,
      ),
      "automation_pipeline_worker_handoff_not_pure_or_dependency_safe",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_MATRIX_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffMatrix,
      mutatedSources(
        implementationPath,
        'source.progression === "dispatch"',
        'source.progression === "selection"',
        2,
        1,
      ),
      "automation_pipeline_worker_handoff_matrix_not_closed_or_fail_closed",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_MATRIX_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffMatrix,
      mutatedSources(
        implementationPath,
        'source.reason === "dispatch_prepared"',
        'source.reason === "pipeline_rejected"',
      ),
      "automation_pipeline_worker_handoff_matrix_not_closed_or_fail_closed",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_MATRIX_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffMatrix,
      mutatedSources(typesPath, '"invalid_admission"', '"removed_reason"'),
      "automation_pipeline_worker_handoff_matrix_not_closed_or_fail_closed",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_IDENTIFIERS_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffIdentifiers,
      mutatedSources(
        implementationPath,
        'source.candidateId !== null && typeof source.candidateId !== "string"',
        "false",
      ),
      "automation_pipeline_worker_handoff_identifiers_or_operational_flags_not_fail_closed",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_IDENTIFIERS_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffIdentifiers,
      mutatedSources(
        implementationPath,
        'source.targetId !== null && typeof source.targetId !== "string"',
        "false",
      ),
      "automation_pipeline_worker_handoff_identifiers_or_operational_flags_not_fail_closed",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_IDENTIFIERS_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffIdentifiers,
      mutatedSources(
        implementationPath,
        "workerSelected: false",
        "workerSelected: true",
      ),
      "automation_pipeline_worker_handoff_identifiers_or_operational_flags_not_fail_closed",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_IDENTIFIERS_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffIdentifiers,
      mutatedSources(
        implementationPath,
        "commandCreated: false",
        "commandCreated: true",
      ),
      "automation_pipeline_worker_handoff_identifiers_or_operational_flags_not_fail_closed",
    ],
    [
      AUTOMATION_PIPELINE_WORKER_HANDOFF_IDENTIFIERS_RULE,
      inspectAutomationOrchestratorPipelineWorkerHandoffIdentifiers,
      mutatedSources(
        implementationPath,
        "\n}",
        '\n}\n"identifier".trim();',
        7,
        7,
      ),
      "automation_pipeline_worker_handoff_identifiers_or_operational_flags_not_fail_closed",
    ],
  ] as const;

  for (const [rule, inspect, fixture, reason] of checks) {
    assertRuleRejects(rule, inspect(fixture), reason);
  }
});

test("AUDIT-514 rejects every missing Pipeline Admission contract and export", () => {
  const typesPath = "src/automation/orchestrator/pipeline-admission-types.ts";
  const implementationPath =
    "src/automation/orchestrator/pipeline-admission.ts";
  const orchestratorBarrelPath = "src/automation/orchestrator/index.ts";
  const automationBarrelPath = "src/automation/index.ts";
  const mutations = [
    {
      name: "missing admission types file",
      fixture: () => sourcesWithout(typesPath),
      reason: "required_file_missing",
    },
    {
      name: "missing admission implementation file",
      fixture: () => sourcesWithout(implementationPath),
      reason: "automation_pipeline_admission_file_missing",
    },
    {
      name: "missing Admission Status contract",
      fixture: () =>
        mutatedSources(
          typesPath,
          "export type AutomationOrchestratorPipelineAdmissionStatus",
          "type AutomationOrchestratorPipelineAdmissionStatus",
        ),
      reason:
        "missing_public_contract:AutomationOrchestratorPipelineAdmissionStatus",
    },
    {
      name: "missing Admission Reason contract",
      fixture: () =>
        mutatedSources(
          typesPath,
          "export type AutomationOrchestratorPipelineAdmissionReason",
          "type AutomationOrchestratorPipelineAdmissionReason",
        ),
      reason:
        "missing_public_contract:AutomationOrchestratorPipelineAdmissionReason",
    },
    {
      name: "missing Admission Decision contract",
      fixture: () =>
        mutatedSources(
          typesPath,
          "export type AutomationOrchestratorPipelineAdmissionDecision",
          "type AutomationOrchestratorPipelineAdmissionDecision",
        ),
      reason:
        "missing_public_contract:AutomationOrchestratorPipelineAdmissionDecision",
    },
    {
      name: "missing admission decision function",
      fixture: () =>
        mutatedSources(
          implementationPath,
          "export function decideAutomationOrchestratorPipelineAdmission",
          "function decideAutomationOrchestratorPipelineAdmission",
        ),
      reason: "automation_pipeline_admission_function_missing",
    },
    {
      name: "missing Orchestrator admission export",
      fixture: () =>
        mutatedSources(
          orchestratorBarrelPath,
          'export { decideAutomationOrchestratorPipelineAdmission } from "./pipeline-admission.js";',
          'export {} from "./pipeline-admission.js";',
        ),
      reason: "automation_pipeline_admission_function_not_canonically_exported",
    },
    {
      name: "missing Automation admission export",
      fixture: () =>
        mutatedSources(
          automationBarrelPath,
          'export { decideAutomationOrchestratorPipelineAdmission } from "./orchestrator/pipeline-admission.js";',
          'export {} from "./orchestrator/pipeline-admission.js";',
        ),
      reason: "automation_pipeline_admission_function_not_canonically_exported",
    },
  ] as const;

  for (const mutation of mutations) {
    assertRuleRejects(
      AUTOMATION_PIPELINE_ADMISSION_CONTRACTS_RULE,
      inspectAutomationOrchestratorPipelineAdmissionContracts(
        mutation.fixture(),
      ),
      mutation.reason,
    );
  }
});

test("AUDIT-515 rejects impure or forbidden Pipeline Admission dependencies", () => {
  const path = "src/automation/orchestrator/pipeline-admission.ts";
  const mutations = [
    [
      "provider import",
      '\nimport type { Provider } from "../provider/index.js";',
    ],
    ["forge import", '\nimport type { Forge } from "../forge/index.js";'],
    [
      "runtime import",
      '\nimport type { Runtime } from "../../runtime/index.js";',
    ],
    [
      "service import",
      '\nimport type { Service } from "../../service/index.js";',
    ],
    [
      "persistence import",
      '\nimport type { Persistence } from "../../persistence/index.js";',
    ],
    [
      "transport import",
      '\nimport type { Transport } from "../../transport/index.js";',
    ],
    ["pipeline call", "\nevaluateAutomationOrchestratorPipeline();"],
    ["validation call", "\nvalidateAutomationOrchestratorPipeline();"],
    [
      "selection call",
      "\nevaluateAutomationOrchestratorDelegationSelection();",
    ],
    ["dispatch call", "\nprepareAutomationOrchestratorDelegationDispatch();"],
    ["execution call", "\nexecuteAutomation();"],
    ["current time", "\nDate.now();"],
    ["randomness", "\nMath.random();"],
    ["timer", "\nsetTimeout(() => undefined, 0);"],
    ["process access", "\nprocess.cwd();"],
    ["filesystem access", '\nimport { readFileSync } from "node:fs";'],
    ["network access", '\nimport { request } from "node:https";'],
    ["subprocess access", '\nimport { spawn } from "node:child_process";'],
    ["summary mutation", '\nsummary.status = "valid";'],
    ["mutable module state", "\nlet admissionRegistry: unknown;"],
  ] as const;

  for (const [name, addition] of mutations) {
    assertRuleRejects(
      AUTOMATION_PIPELINE_ADMISSION_PURITY_RULE,
      inspectAutomationOrchestratorPipelineAdmissionPurity(
        mutatedSources(path, "\n}", `\n}${addition}`, 6, 6),
      ),
      "automation_pipeline_admission_not_pure_or_dependency_safe",
    );
    assert.ok(name.length > 0);
  }
});

test("AUDIT-516 rejects every open or permissive Pipeline Admission matrix", () => {
  const implementationPath =
    "src/automation/orchestrator/pipeline-admission.ts";
  const typesPath = "src/automation/orchestrator/pipeline-admission-types.ts";
  const mutations = [
    [
      "missing evaluation branch",
      implementationPath,
      'progression === "evaluation"',
      'progression === "removed_evaluation"',
      2,
      2,
    ],
    [
      "missing selection branch",
      implementationPath,
      'progression === "selection"',
      'progression === "removed_selection"',
      2,
      2,
    ],
    [
      "missing dispatch branch",
      implementationPath,
      'progression === "dispatch"',
      'progression === "removed_dispatch"',
      2,
      2,
    ],
    [
      "missing denied evaluation status",
      implementationPath,
      '["denied", "indeterminate"]',
      '["indeterminate"]',
    ],
    [
      "missing indeterminate evaluation status",
      implementationPath,
      '["denied", "indeterminate"]',
      '["denied"]',
    ],
    [
      "missing rejected selection status",
      implementationPath,
      '["rejected", "indeterminate"]',
      '["indeterminate"]',
    ],
    [
      "missing prepared dispatch status",
      implementationPath,
      '["prepared", "rejected", "indeterminate"]',
      '["rejected", "indeterminate"]',
    ],
    [
      "missing rejected dispatch status",
      implementationPath,
      '["prepared", "rejected", "indeterminate"]',
      '["prepared", "indeterminate"]',
    ],
    [
      "missing dispatch prepared reason",
      typesPath,
      '"dispatch_prepared"',
      '"removed_reason"',
    ],
    [
      "missing pipeline rejected reason",
      typesPath,
      '"pipeline_rejected"',
      '"removed_reason"',
    ],
    [
      "missing pipeline indeterminate reason",
      typesPath,
      '"pipeline_indeterminate"',
      '"removed_reason"',
    ],
    [
      "missing invalid summary reason",
      typesPath,
      '"invalid_summary"',
      '"removed_reason"',
    ],
    [
      "missing selection evaluation precondition",
      implementationPath,
      'source.evaluation,\n      ["eligible"],',
      'source.evaluation,\n      ["denied"],',
      2,
      1,
    ],
    [
      "missing dispatch evaluation precondition",
      implementationPath,
      'source.evaluation,\n      ["eligible"],',
      'source.evaluation,\n      ["denied"],',
      2,
      2,
    ],
    [
      "missing dispatch selection precondition",
      implementationPath,
      'source.selection,\n      ["selected"],',
      'source.selection,\n      ["rejected"],',
    ],
    [
      "missing complete validation subject precondition",
      implementationPath,
      'source.validationSubjectStatus !== "complete"',
      "false",
    ],
    [
      "admission based only on summary valid",
      implementationPath,
      "  const source: unknown = summary;",
      '  if (summary.valid === true) return decision("admitted", "dispatch_prepared", null);\n  const source: unknown = summary;',
    ],
    [
      "permissive terminal fallback",
      implementationPath,
      'return decision("indeterminate", "invalid_summary", null);',
      'return decision("admitted", "dispatch_prepared", source);',
      3,
      3,
    ],
    [
      "eligible evaluation terminal",
      implementationPath,
      '["denied", "indeterminate"]',
      '["denied", "indeterminate", "eligible"]',
    ],
    [
      "selected selection terminal",
      implementationPath,
      '["rejected", "indeterminate"]',
      '["rejected", "indeterminate", "selected"]',
    ],
    [
      "cross-stage selection status",
      implementationPath,
      '["rejected", "indeterminate"]',
      '["rejected", "indeterminate", "prepared"]',
    ],
  ] as const;

  for (const [
    name,
    path,
    pattern,
    replacement,
    occurrences,
    occurrence,
  ] of mutations) {
    assertRuleRejects(
      AUTOMATION_PIPELINE_ADMISSION_MATRIX_RULE,
      inspectAutomationOrchestratorPipelineAdmissionMatrix(
        mutatedSources(path, pattern, replacement, occurrences, occurrence),
      ),
      "automation_pipeline_admission_matrix_not_closed_or_fail_closed",
      name,
    );
    assert.ok(name.length > 0);
  }
});

test("AUDIT-517 rejects identifier weakening and operational flag changes", () => {
  const path = "src/automation/orchestrator/pipeline-admission.ts";
  const appendAtEnd = (addition: string): readonly AutomationAuditSource[] =>
    mutatedSources(
      path,
      'return decision("indeterminate", "invalid_summary", null);\n}',
      `return decision("indeterminate", "invalid_summary", null);\n}${addition}`,
    );
  const mutations = [
    [
      "missing candidateId type check",
      () =>
        mutatedSources(
          path,
          'candidateId !== null && typeof candidateId !== "string"',
          "false",
        ),
    ],
    [
      "missing targetId type check",
      () =>
        mutatedSources(
          path,
          'targetId !== null && typeof targetId !== "string"',
          "false",
        ),
    ],
    ["identifier trim", () => appendAtEnd('\n"identifier".trim();')],
    ["identifier length", () => appendAtEnd('\n"identifier".length > 0;')],
    [
      "identifier lowercase",
      () => appendAtEnd('\n"identifier".toLowerCase();'),
    ],
    [
      "identifier uppercase",
      () => appendAtEnd('\n"identifier".toUpperCase();'),
    ],
    [
      "dispatch occurred",
      () =>
        mutatedSources(
          path,
          "dispatchOccurred: false",
          "dispatchOccurred: true",
        ),
    ],
    [
      "delegation occurred",
      () =>
        mutatedSources(
          path,
          "delegationOccurred: false",
          "delegationOccurred: true",
        ),
    ],
    [
      "provider invoked",
      () =>
        mutatedSources(path, "providerInvoked: false", "providerInvoked: true"),
    ],
    [
      "forge invoked",
      () => mutatedSources(path, "forgeInvoked: false", "forgeInvoked: true"),
    ],
    [
      "execution started",
      () =>
        mutatedSources(
          path,
          "executionStarted: false",
          "executionStarted: true",
        ),
    ],
  ] as const;

  for (const [name, fixture] of mutations) {
    assertRuleRejects(
      AUTOMATION_PIPELINE_ADMISSION_IDENTIFIERS_RULE,
      inspectAutomationOrchestratorPipelineAdmissionIdentifiers(fixture()),
      "automation_pipeline_admission_identifiers_or_operational_flags_not_fail_closed",
    );
    assert.ok(name.length > 0);
  }
});

test("Automation contract inspectors reject missing public exports", () => {
  const path = "src/automation/provider/index.ts";
  const fixture = sources({
    path,
    source: source(path).replace("  AutomationProvider,", ""),
  });

  assert.deepEqual(inspectAutomationProviderContracts(fixture), [
    {
      path,
      reason: "missing_barrel_export:AutomationProvider",
    },
  ]);
});

test("Automation pipeline inspector rejects impure, bypassing, and non-canonical composition", () => {
  const path = "src/automation/orchestrator/pipeline.ts";
  const pipeline = source(path);
  const mutations = [
    `${pipeline}\nDate.now();`,
    `${pipeline}\nMath.random();`,
    `${pipeline}\nprocess.env.AUTOMATION;`,
    `${pipeline}\nimport { readFileSync } from "node:fs";`,
    `${pipeline}\nimport { request } from "node:https";`,
    `${pipeline}\nsetTimeout(() => undefined, 0);`,
    `${pipeline}\nlet pipelineState: unknown;`,
    `${pipeline}\nimport type { ProviderImplementation } from "../provider/implementation.js";`,
    `${pipeline}\nimport type { ForgeImplementation } from "../forge/implementation.js";`,
    `${pipeline}\nimport type { TransportAdapter } from "../adapters/transport.js";`,
    `${pipeline}\nimport type { Core } from "../core/index.js";`,
    pipeline.replaceAll(
      "delegationSelection: null",
      "delegationSelection: input.delegationSelection as never",
    ),
    pipeline.replaceAll(
      "delegationDispatch: null",
      "delegationDispatch: input.delegationDispatch as never",
    ),
    `${pipeline}\ninput.delegationSelection = null as never;`,
    `${pipeline}\ncallback();`,
    `${pipeline}\ncommand();`,
  ];
  for (const [index, mutated] of mutations.entries()) {
    assert.deepEqual(
      inspectAutomationOrchestratorPipeline(sources({ path, source: mutated })),
      [
        {
          path,
          reason: "automation_pipeline_not_pure_composed_or_fail_closed",
        },
      ],
      `mutation ${index}`,
    );
  }

  const barrelPath = "src/automation/orchestrator/index.ts";
  assert.deepEqual(
    inspectAutomationOrchestratorPipeline(
      sources({
        path: barrelPath,
        source: source(barrelPath).replace(
          'from "./pipeline.js";',
          'from "./missing-pipeline.js";',
        ),
      }),
    ),
    [
      {
        path,
        reason: "automation_pipeline_not_pure_composed_or_fail_closed",
      },
    ],
  );
});

test("Automation pipeline validation inspector rejects behavior, effects, and weakened consistency", () => {
  const path = "src/automation/orchestrator/pipeline-validation.ts";
  const validation = source(path);
  const mutations = [
    `${validation}\nevaluateAutomationOrchestratorDelegation({} as never);`,
    `${validation}\nevaluateAutomationOrchestratorDelegationSelection({} as never);`,
    `${validation}\nprepareAutomationOrchestratorDelegationDispatch({} as never);`,
    `${validation}\nDate.now();`,
    `${validation}\nMath.random();`,
    `${validation}\nprocess.env.AUTOMATION;`,
    `${validation}\nimport { readFileSync } from "node:fs";`,
    `${validation}\nimport { request } from "node:https";`,
    `${validation}\nsetTimeout(() => undefined, 0);`,
    `${validation}\nlet validationCache: unknown;`,
    `${validation}\nconst bindingRegistry = new Map();`,
    `${validation}\nimport type { ProviderImplementation } from "../provider/implementation.js";`,
    `${validation}\nimport type { ForgeImplementation } from "../forge/implementation.js";`,
    `${validation}\nimport type { TransportAdapter } from "../adapters/transport.js";`,
    `${validation}\npipeline.delegationEvaluation = null as never;`,
    validation.replace('evaluation.status === "eligible"', "false"),
    validation.replace('selection.status === "selected"', "false"),
    validation.replaceAll("dispatch === null", "false"),
    validation.replaceAll(
      "executionStarted === false",
      "executionStarted === true",
    ),
    validation.replace("stableCompare(left.code, right.code)", "0"),
    validation.replaceAll("subject,", ""),
    `${validation}\nconst matches = pipeline === source;`,
    `${validation}\nconst fabricated = { requestId: "fabricated" };`,
    validation.replaceAll(
      'status: "incomplete" as const',
      'status: "complete" as const',
    ),
    `${validation}\ncallback();`,
    `${validation}\ncommand();`,
  ];
  for (const [index, mutated] of mutations.entries()) {
    assert.deepEqual(
      inspectAutomationOrchestratorPipelineValidation(
        sources({ path, source: mutated }),
      ),
      [
        {
          path,
          reason: "automation_pipeline_validation_not_pure_or_fail_closed",
        },
      ],
      `mutation ${index}`,
    );
  }

  const barrelPath = "src/automation/orchestrator/index.ts";
  assert.deepEqual(
    inspectAutomationOrchestratorPipelineValidation(
      sources({
        path: barrelPath,
        source: source(barrelPath).replace(
          'from "./pipeline-validation.js";',
          'from "./missing-pipeline-validation.js";',
        ),
      }),
    ),
    [
      {
        path,
        reason: "automation_pipeline_validation_not_pure_or_fail_closed",
      },
    ],
  );
});

test("Automation pipeline public-contract inspector rejects competing, open, mutable, and operational shapes", () => {
  const path = "src/automation/orchestrator/pipeline-types.ts";
  const contracts = source(path);
  const mutations = [
    `${contracts}\nimport type { ProviderImplementation } from "../provider/implementation.js";`,
    `${contracts}\nimport type { ForgeImplementation } from "../forge/implementation.js";`,
    `${contracts}\nimport type { TransportAdapter } from "../adapters/transport.js";`,
    `${contracts}\nimport type { Core } from "../core/index.js";`,
    contracts.replace('"dispatch";', '"dispatch" | string;'),
    contracts.replace('"invalid";', '"invalid" | string;'),
    contracts.replace(
      "export type AutomationOrchestratorPipelineResult = Readonly",
      "export type AutomationOrchestratorPipelineResult =",
    ),
    `${contracts}\nexport type Unsafe = Readonly<{ callback: () => void }>;`,
    `${contracts}\nexport type Unsafe = Readonly<{ executionStarted: true }>;`,
    `${contracts}\nexport type Unsafe = Readonly<{ ready: true }>;`,
    `${contracts}\nexport type Unsafe = Readonly<{ pipeline: AutomationOrchestratorPipelineResult }>;`,
    `${contracts}\nexport type Unsafe = Readonly<{ evidence: readonly string[] }>;`,
    `${contracts}\nexport type AutomationOrchestratorPipelineValidationSubject = Readonly<{}>;`,
  ];
  for (const [index, mutated] of mutations.entries()) {
    assert.deepEqual(
      inspectAutomationOrchestratorPipelineContracts(
        sources({ path, source: mutated }),
      ),
      [
        {
          path,
          reason:
            "automation_pipeline_public_contracts_not_closed_immutable_or_dependency_safe",
        },
      ],
      `mutation ${index}`,
    );
  }

  const pipelinePath = "src/automation/orchestrator/pipeline.ts";
  const barrelPath = "src/automation/orchestrator/index.ts";
  assert.deepEqual(
    inspectAutomationOrchestratorPipeline(
      sources({
        path: pipelinePath,
        source: `${source(pipelinePath)}\ntype AutomationOrchestratorPipelineResult = Readonly<Record<string, unknown>>;`,
      }),
    ),
    [
      {
        path: pipelinePath,
        reason: "automation_pipeline_not_pure_composed_or_fail_closed",
      },
    ],
  );

  assert.deepEqual(
    inspectAutomationOrchestratorPipelineContracts(
      sources({
        path: barrelPath,
        source: source(barrelPath).replace(
          "  AutomationOrchestratorPipelineValidationSubject,",
          "",
        ),
      }),
    ),
    [
      {
        path: barrelPath,
        reason:
          "missing_barrel_export:AutomationOrchestratorPipelineValidationSubject",
      },
    ],
  );

  assert.deepEqual(
    inspectAutomationOrchestratorPipelineContracts(
      sources({
        path: barrelPath,
        source: source(barrelPath).replace(
          "  AutomationOrchestratorPipelineResult,",
          "",
        ),
      }),
    ),
    [
      {
        path: barrelPath,
        reason: "missing_barrel_export:AutomationOrchestratorPipelineResult",
      },
    ],
  );
});

test("Automation contract consistency rejects competing canonical barrels", () => {
  const path = "src/automation/index.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nexport type { AutomationOrchestrator } from "./orchestrator/index.js";`,
  });

  assert.deepEqual(inspectAutomationContractConsistency(fixture), [
    {
      path,
      reason: "automation_canonical_barrel_competing_or_missing",
    },
  ]);
});

test("Automation contract consistency rejects mutable, non-JSON-safe, and open contract shapes", () => {
  const path = "src/automation/orchestrator/planning/types.ts";

  assert.deepEqual(
    inspectAutomationContractConsistency(
      sources({
        path,
        source: `${source(path)}\nexport type OrchestrationPlan = Readonly<{ status: "planned" }>;`,
      }),
    ),
    [
      {
        path,
        reason: "automation_contract_name_not_automation_prefixed",
      },
    ],
  );
  assert.deepEqual(
    inspectAutomationContractConsistency(
      sources({
        path,
        source: `${source(path)}\nexport type AutomationMutablePlan = { value: string };`,
      }),
    ),
    [
      {
        path,
        reason: "automation_contract_contains_mutable_public_shape",
      },
    ],
  );
  assert.deepEqual(
    inspectAutomationContractConsistency(
      sources({
        path,
        source: `${source(path)}\nexport type AutomationCallbackPlan = Readonly<{ callback: () => void }>;`,
      }),
    ),
    [
      {
        path,
        reason: "automation_contract_contains_non_json_safe_callback",
      },
    ],
  );
  assert.deepEqual(
    inspectAutomationContractConsistency(
      sources({
        path,
        source: `${source(path)}\nexport type AutomationOpenPlan = Readonly<{ status: string }>;`,
      }),
    ),
    [
      {
        path,
        reason: "automation_contract_contains_open_status",
      },
    ],
  );
});

test("Automation contract consistency preserves false operational flags and fail-closed evidence", () => {
  const planningPath = "src/automation/orchestrator/planning/types.ts";
  const evaluationPath = "src/automation/orchestrator/evaluation/types.ts";

  assert.deepEqual(
    inspectAutomationContractConsistency(
      sources({
        path: planningPath,
        source: source(planningPath).replace(
          "delegationOccurred: false;",
          "delegationOccurred: true;",
        ),
      }),
    ),
    [
      {
        path: planningPath,
        reason: "automation_contract_contains_operational_flag_true",
      },
      {
        path: planningPath,
        reason: "automation_contract_non_operational_flags_incomplete",
      },
    ],
  );
  assert.deepEqual(
    inspectAutomationContractConsistency(
      sources({
        path: evaluationPath,
        source: source(evaluationPath).replace(
          '    | "evidence_missing"\n',
          "",
        ),
      }),
    ),
    [
      {
        path: evaluationPath,
        reason: "automation_evaluation_evidence_missing_not_fail_closed",
      },
    ],
  );
});

test("Automation contract inspectors reject missing evaluation exports", () => {
  const path = "src/automation/orchestrator/evaluation/index.ts";
  const fixture = sources({
    path,
    source: source(path).replace("  AutomationOrchestratorEvaluator,", ""),
  });

  assert.deepEqual(inspectAutomationOrchestratorEvaluationContracts(fixture), [
    {
      path,
      reason: "missing_barrel_export:AutomationOrchestratorEvaluator",
    },
  ]);
});

test("Automation contract inspectors reject missing planning exports", () => {
  const path = "src/automation/orchestrator/planning/index.ts";
  const fixture = sources({
    path,
    source: source(path).replace("  AutomationOrchestratorPlanner,", ""),
  });

  assert.deepEqual(inspectAutomationOrchestratorPlanningContracts(fixture), [
    {
      path,
      reason: "missing_barrel_export:AutomationOrchestratorPlanner",
    },
  ]);
});

test("Automation contract inspectors reject planner behavior, dependencies, and scheduling", () => {
  const path = "src/automation/orchestrator/planning/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nexport function plan(): null { return null; }\nsetTimeout(() => undefined, 0);\nimport type { Core } from "../../../core/index.js";`,
  });

  assert.deepEqual(inspectAutomationOrchestratorPlanningContracts(fixture), [
    {
      path,
      reason:
        "orchestrator_planning_contract_contains_implementation_scheduler_or_forbidden_dependency",
    },
  ]);
  assert.deepEqual(inspectAutomationDependencyDirection(fixture), [
    {
      path,
      reason: "automation_dependency_direction_violation",
    },
  ]);
  assert.deepEqual(inspectAutomationForbiddenDependencies(fixture), [
    {
      path,
      reason: "forbidden_automation_dependency:../../../core/index.js",
    },
  ]);
});

test("Automation contract inspectors reject missing delegation exports", () => {
  const path = "src/automation/orchestrator/delegation/index.ts";
  const fixture = sources({
    path,
    source: source(path).replace("  AutomationOrchestratorDelegator,", ""),
  });

  assert.deepEqual(inspectAutomationOrchestratorDelegationContracts(fixture), [
    {
      path,
      reason: "missing_barrel_export:AutomationOrchestratorDelegator",
    },
  ]);
});

test("Automation contract inspectors reject delegator behavior, dependencies, and scheduling", () => {
  const path = "src/automation/orchestrator/delegation/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nexport function delegate(): null { return null; }\nsetTimeout(() => undefined, 0);\nimport type { Core } from "../../../core/index.js";`,
  });

  assert.deepEqual(inspectAutomationOrchestratorDelegationContracts(fixture), [
    {
      path,
      reason:
        "orchestrator_delegation_contract_contains_implementation_scheduler_or_forbidden_dependency",
    },
  ]);
  assert.deepEqual(inspectAutomationDependencyDirection(fixture), [
    {
      path,
      reason: "automation_dependency_direction_violation",
    },
  ]);
  assert.deepEqual(inspectAutomationForbiddenDependencies(fixture), [
    {
      path,
      reason: "forbidden_automation_dependency:../../../core/index.js",
    },
  ]);
});

test("Automation contract inspectors reject delegation effects and mutable registries", () => {
  const path = "src/automation/orchestrator/delegation/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nlet delegationRegistry: unknown;\nprocess.cwd();\nreadFileSync("delegation");`,
  });

  assert.deepEqual(inspectAutomationPurity(fixture), [
    {
      path,
      reason: "automation_contract_contains_effect_or_mutable_global",
    },
  ]);
});

test("Automation contract inspectors reject missing delegation-evaluation exports", () => {
  const path = "src/automation/orchestrator/delegation-evaluation/index.ts";
  const fixture = sources({
    path,
    source: source(path).replace(
      "  AutomationOrchestratorDelegationEvaluator,",
      "",
    ),
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationEvaluationContracts(fixture),
    [
      {
        path,
        reason:
          "missing_barrel_export:AutomationOrchestratorDelegationEvaluator",
      },
    ],
  );
});

test("Automation contract inspectors reject delegation-evaluator behavior, scheduling, commands, and dependencies", () => {
  const path = "src/automation/orchestrator/delegation-evaluation/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nexport function evaluate(): null { return null; }\nclass DelegationEvaluator {}\nsetTimeout(() => undefined, 0);\nconst callback = () => undefined;\nconst command = "run";\nimport type { Core } from "../../../core/index.js";`,
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationEvaluationContracts(fixture),
    [
      {
        path,
        reason:
          "orchestrator_delegation_evaluation_contract_contains_implementation_forbidden_dependency_or_non_fail_closed_decision",
      },
    ],
  );
  assert.deepEqual(inspectAutomationDependencyDirection(fixture), [
    {
      path,
      reason: "automation_dependency_direction_violation",
    },
  ]);
  assert.deepEqual(inspectAutomationForbiddenDependencies(fixture), [
    {
      path,
      reason: "forbidden_automation_dependency:../../../core/index.js",
    },
  ]);
});

test("Automation contract inspectors reject provider or forge implementation dependencies in delegation evaluation", () => {
  const path = "src/automation/orchestrator/delegation-evaluation/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nimport type { ProviderImplementation } from "../../provider/implementation.js";\nimport type { ForgeImplementation } from "../../forge/implementation.js";`,
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationEvaluationContracts(fixture),
    [
      {
        path,
        reason:
          "orchestrator_delegation_evaluation_contract_contains_implementation_forbidden_dependency_or_non_fail_closed_decision",
      },
    ],
  );
  assert.deepEqual(inspectAutomationDependencyDirection(fixture), [
    {
      path,
      reason: "automation_dependency_direction_violation",
    },
  ]);
});

test("Automation contract inspectors reject delegation-evaluation effects and mutable registries", () => {
  const path = "src/automation/orchestrator/delegation-evaluation/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nlet evaluationRegistry: unknown;\nprocess.cwd();\nreadFileSync("delegation-evaluation");`,
  });

  assert.deepEqual(inspectAutomationPurity(fixture), [
    {
      path,
      reason: "automation_contract_contains_effect_or_mutable_global",
    },
  ]);
});

test("Automation contract inspectors reject missing evidence modeled as eligible", () => {
  const path = "src/automation/orchestrator/delegation-evaluation/types.ts";
  const fixture = sources({
    path,
    source: source(path).replace(
      'status: "indeterminate";',
      'status: "eligible";',
    ),
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationEvaluationContracts(fixture),
    [
      {
        path,
        reason:
          "orchestrator_delegation_evaluation_contract_contains_implementation_forbidden_dependency_or_non_fail_closed_decision",
      },
    ],
  );
});

test("Automation contract inspector rejects impure or non-fail-closed delegation evaluation implementations", () => {
  const path =
    "src/automation/orchestrator/delegation-evaluation/evaluation.ts";
  const implementation = source(path);
  const mutations = [
    `${implementation}\nDate.now();`,
    `${implementation}\nMath.random();`,
    `${implementation}\nprocess.env.AUTOMATION;`,
    `${implementation}\nimport { readFileSync } from "node:fs";`,
    `${implementation}\nimport { request } from "node:https";`,
    `${implementation}\nsetTimeout(() => undefined, 0);`,
    `${implementation}\nlet evaluationRegistry: unknown;`,
    `${implementation}\nimport type { ProviderImplementation } from "../../provider/implementation.js";`,
    `${implementation}\nimport type { ForgeImplementation } from "../../forge/implementation.js";`,
    `${implementation}\nimport type { Selector } from "../delegation-selection/index.js";`,
    `${implementation}\nimport type { Dispatcher } from "../delegation-dispatch/index.js";`,
    implementation.replaceAll('"evidence_missing"', '"evidence_invalid"'),
    implementation.replaceAll(
      "delegationOccurred: false",
      "delegationOccurred: true",
    ),
    `${implementation}\ninput.evidence = [];`,
    implementation.replaceAll(".sort(stableCompare)", ".sort()"),
    `${implementation}\ncallback();`,
  ];

  for (const [index, mutated] of mutations.entries()) {
    assert.deepEqual(
      inspectAutomationOrchestratorDelegationEvaluationImplementation(
        sources({ path, source: mutated }),
      ),
      [
        {
          path,
          reason:
            "delegation_evaluation_implementation_not_pure_deterministic_or_fail_closed",
        },
      ],
      `mutation ${index}`,
    );
  }
});

test("Automation contract inspectors reject missing delegation-selection exports", () => {
  const path = "src/automation/orchestrator/delegation-selection/index.ts";
  const fixture = sources({
    path,
    source: source(path).replace(
      "  AutomationOrchestratorDelegationSelector,",
      "",
    ),
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationSelectionContracts(fixture),
    [
      {
        path,
        reason:
          "missing_barrel_export:AutomationOrchestratorDelegationSelector",
      },
    ],
  );
});

test("Automation contract inspector rejects impure or non-fail-closed delegation selection implementations", () => {
  const path = "src/automation/orchestrator/delegation-selection/evaluation.ts";
  const implementation = source(path);
  const mutations = [
    `${implementation}\nDate.now();`,
    `${implementation}\nMath.random();`,
    `${implementation}\nprocess.env.AUTOMATION;`,
    `${implementation}\nimport { readFileSync } from "node:fs";`,
    `${implementation}\nimport { request } from "node:https";`,
    `${implementation}\nsetTimeout(() => undefined, 0);`,
    `${implementation}\nlet candidateRegistry: unknown;`,
    `${implementation}\nimport type { ProviderImplementation } from "../../provider/implementation.js";`,
    `${implementation}\nimport type { ForgeImplementation } from "../../forge/implementation.js";`,
    `${implementation}\nimport type { Dispatcher } from "../delegation-dispatch/index.js";`,
    implementation.replaceAll(
      'status: "rejected" as const',
      'status: "selected" as const',
    ),
    implementation.replace('"candidate_missing"', '"candidate_invalid"'),
    implementation.replace('"candidate_invalid"', '"candidate_missing"'),
    implementation.replaceAll(
      "delegationOccurred: false",
      "delegationOccurred: true",
    ),
    `${implementation}\ninput.candidates = [];`,
    implementation.replace("valid.sort(compareCandidate)", "valid.sort()"),
    `${implementation}\ncallback();`,
    `${implementation}\ncommand();`,
  ];

  for (const [index, mutated] of mutations.entries()) {
    assert.deepEqual(
      inspectAutomationOrchestratorDelegationSelectionImplementation(
        sources({ path, source: mutated }),
      ),
      [
        {
          path,
          reason:
            "delegation_selection_implementation_not_pure_deterministic_or_fail_closed",
        },
      ],
      `mutation ${index}`,
    );
  }

  const barrelPath =
    "src/automation/orchestrator/delegation-selection/index.ts";
  assert.deepEqual(
    inspectAutomationOrchestratorDelegationSelectionImplementation(
      sources({
        path: barrelPath,
        source: source(barrelPath).replace(
          'from "./evaluation.js";',
          'from "./missing.js";',
        ),
      }),
    ),
    [
      {
        path,
        reason:
          "delegation_selection_implementation_not_pure_deterministic_or_fail_closed",
      },
    ],
  );
});

test("Automation contract inspectors reject selector implementation, callbacks, commands, timers, and scoring", () => {
  const path = "src/automation/orchestrator/delegation-selection/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nexport function select(): null { return null; }\nclass DelegationSelector {}\nconst callback = () => undefined;\nconst command = "run";\nsetTimeout(() => undefined, 0);\nconst score = 1;`,
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationSelectionContracts(fixture),
    [
      {
        path,
        reason:
          "orchestrator_delegation_selection_contract_contains_implementation_forbidden_dependency_or_operational_decision",
      },
    ],
  );
});

test("Automation contract inspectors reject provider and forge dependencies in delegation selection", () => {
  const path = "src/automation/orchestrator/delegation-selection/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nimport type { ProviderImplementation } from "../../provider/implementation.js";\nimport type { ForgeImplementation } from "../../forge/implementation.js";`,
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationSelectionContracts(fixture),
    [
      {
        path,
        reason:
          "orchestrator_delegation_selection_contract_contains_implementation_forbidden_dependency_or_operational_decision",
      },
    ],
  );
  assert.deepEqual(inspectAutomationDependencyDirection(fixture), [
    {
      path,
      reason: "automation_dependency_direction_violation",
    },
  ]);
});

test("Automation contract inspectors reject delegation-selection effects and mutable registries", () => {
  const path = "src/automation/orchestrator/delegation-selection/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nlet selectionRegistry: unknown;\nprocess.cwd();\nreadFileSync("delegation-selection");`,
  });

  assert.deepEqual(inspectAutomationPurity(fixture), [
    {
      path,
      reason: "automation_contract_contains_effect_or_mutable_global",
    },
  ]);
});

test("Automation contract inspectors reject selected decisions that imply delegation", () => {
  const path = "src/automation/orchestrator/delegation-selection/types.ts";
  const fixture = sources({
    path,
    source: source(path).replace(
      'status: "selected";\n      candidate: AutomationOrchestratorDelegationSelectionCandidate;\n      evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[];\n      delegationOccurred: false;',
      'status: "selected";\n      candidate: AutomationOrchestratorDelegationSelectionCandidate;\n      evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[];\n      delegationOccurred: true;',
    ),
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationSelectionContracts(fixture),
    [
      {
        path,
        reason:
          "orchestrator_delegation_selection_contract_contains_implementation_forbidden_dependency_or_operational_decision",
      },
    ],
  );
});

test("Automation contract inspectors reject selected decisions that start execution", () => {
  const path = "src/automation/orchestrator/delegation-selection/types.ts";
  const fixture = sources({
    path,
    source: source(path).replace(
      'status: "selected";\n      candidate: AutomationOrchestratorDelegationSelectionCandidate;\n      evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[];\n      delegationOccurred: false;\n      providerInvoked: false;\n      forgeInvoked: false;\n      executionStarted: false;',
      'status: "selected";\n      candidate: AutomationOrchestratorDelegationSelectionCandidate;\n      evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[];\n      delegationOccurred: false;\n      providerInvoked: false;\n      forgeInvoked: false;\n      executionStarted: true;',
    ),
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationSelectionContracts(fixture),
    [
      {
        path,
        reason:
          "orchestrator_delegation_selection_contract_contains_implementation_forbidden_dependency_or_operational_decision",
      },
    ],
  );
});

test("Automation contract inspectors reject missing delegation-dispatch exports", () => {
  const path = "src/automation/orchestrator/delegation-dispatch/index.ts";
  const fixture = sources({
    path,
    source: source(path).replace(
      "  AutomationOrchestratorDelegationDispatcher,",
      "",
    ),
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationDispatchContracts(fixture),
    [
      {
        path,
        reason:
          "missing_barrel_export:AutomationOrchestratorDelegationDispatcher",
      },
    ],
  );
});

test("Automation contract inspector rejects impure or non-fail-closed dispatch preparation", () => {
  const path = "src/automation/orchestrator/delegation-dispatch/preparation.ts";
  const preparation = source(path);
  const mutations = [
    `${preparation}\nDate.now();`,
    `${preparation}\nMath.random();`,
    `${preparation}\nprocess.env.AUTOMATION;`,
    `${preparation}\nimport { readFileSync } from "node:fs";`,
    `${preparation}\nimport { request } from "node:https";`,
    `${preparation}\nsetTimeout(() => undefined, 0);`,
    `${preparation}\nlet dispatchRegistry: unknown;`,
    `${preparation}\nimport type { ProviderImplementation } from "../../provider/implementation.js";`,
    `${preparation}\nimport type { ForgeImplementation } from "../../forge/implementation.js";`,
    `${preparation}\nimport type { TransportAdapter } from "../../adapters/transport.js";`,
    preparation.replaceAll(
      'status: "rejected" as const',
      'status: "prepared" as const',
    ),
    preparation.replace(
      '"selection_indeterminate"',
      '"dispatch_indeterminate"',
    ),
    preparation.replace('"target_invalid"', '"dispatch_indeterminate"'),
    preparation.replace('"evidence_missing"', '"evidence_invalid"'),
    preparation.replaceAll("dispatchOccurred: false", "dispatchOccurred: true"),
    preparation.replaceAll(
      "delegationOccurred: false",
      "delegationOccurred: true",
    ),
    preparation.replaceAll("providerInvoked: false", "providerInvoked: true"),
    preparation.replaceAll("forgeInvoked: false", "forgeInvoked: true"),
    preparation.replaceAll("executionStarted: false", "executionStarted: true"),
    `${preparation}\ninput.target = null;`,
    preparation.replace("result.sort(compareEvidence)", "result.sort()"),
    `${preparation}\ncallback();`,
    `${preparation}\ncommand();`,
    `${preparation}\nsend();`,
  ];
  for (const [index, mutated] of mutations.entries()) {
    assert.deepEqual(
      inspectAutomationOrchestratorDelegationDispatchPreparation(
        sources({ path, source: mutated }),
      ),
      [
        {
          path,
          reason:
            "delegation_dispatch_preparation_not_pure_deterministic_or_fail_closed",
        },
      ],
      `mutation ${index}`,
    );
  }
  const barrelPath = "src/automation/orchestrator/delegation-dispatch/index.ts";
  assert.deepEqual(
    inspectAutomationOrchestratorDelegationDispatchPreparation(
      sources({
        path: barrelPath,
        source: source(barrelPath).replace(
          'from "./preparation.js";',
          'from "./missing.js";',
        ),
      }),
    ),
    [
      {
        path,
        reason:
          "delegation_dispatch_preparation_not_pure_deterministic_or_fail_closed",
      },
    ],
  );
});

test("Automation contract inspectors reject dispatcher implementations, commands, callbacks, and scheduling", () => {
  const path = "src/automation/orchestrator/delegation-dispatch/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nexport function dispatch(): null { return null; }\nclass DelegationDispatcher {}\nconst callback = () => undefined;\nconst command = "run";\nconst argv = ["run"];\nsetTimeout(() => undefined, 0);`,
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationDispatchContracts(fixture),
    [
      {
        path,
        reason:
          "orchestrator_delegation_dispatch_contract_contains_implementation_forbidden_dependency_or_operational_decision",
      },
    ],
  );
});

test("Automation contract inspectors reject Core, provider, forge, and transport dependencies in delegation dispatch", () => {
  const path = "src/automation/orchestrator/delegation-dispatch/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nimport type { Core } from "../../../core/index.js";\nimport type { ProviderImplementation } from "../../provider/implementation.js";\nimport type { ForgeImplementation } from "../../forge/implementation.js";\nimport type { TransportAdapter } from "../../adapters/transport.js";`,
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationDispatchContracts(fixture),
    [
      {
        path,
        reason:
          "orchestrator_delegation_dispatch_contract_contains_implementation_forbidden_dependency_or_operational_decision",
      },
    ],
  );
  assert.deepEqual(inspectAutomationDependencyDirection(fixture), [
    {
      path,
      reason: "automation_dependency_direction_violation",
    },
  ]);
  assert.deepEqual(inspectAutomationForbiddenDependencies(fixture), [
    {
      path,
      reason: "forbidden_automation_dependency:../../../core/index.js",
    },
    {
      path,
      reason: "forbidden_automation_dependency:../../adapters/transport.js",
    },
  ]);
});

test("Automation contract inspectors reject delegation-dispatch effects, environment access, and mutable registries", () => {
  const path = "src/automation/orchestrator/delegation-dispatch/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nlet dispatchRegistry: unknown;\nprocess.cwd();\nprocess.env.HOME;\nreadFileSync("dispatch");\nfetch("https://example.test");`,
  });

  assert.deepEqual(inspectAutomationPurity(fixture), [
    {
      path,
      reason: "automation_contract_contains_effect_or_mutable_global",
    },
  ]);
});

function assertPreparedFlagIsRejected(from: string, to: string): void {
  const path = "src/automation/orchestrator/delegation-dispatch/types.ts";
  const fixture = sources({ path, source: source(path).replace(from, to) });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationDispatchContracts(fixture),
    [
      {
        path,
        reason:
          "orchestrator_delegation_dispatch_contract_contains_implementation_forbidden_dependency_or_operational_decision",
      },
    ],
  );
}

test("Automation contract inspectors reject prepared dispatches that occurred", () => {
  assertPreparedFlagIsRejected(
    'status: "prepared";\n      target: AutomationOrchestratorDelegationDispatchTarget;\n      evidence: readonly AutomationOrchestratorDelegationDispatchEvidence[];\n      dispatchOccurred: false;',
    'status: "prepared";\n      target: AutomationOrchestratorDelegationDispatchTarget;\n      evidence: readonly AutomationOrchestratorDelegationDispatchEvidence[];\n      dispatchOccurred: true;',
  );
});

test("Automation contract inspectors reject prepared dispatches that delegated, invoked a provider or forge, or started execution", () => {
  const sourceToMutate = source(
    "src/automation/orchestrator/delegation-dispatch/types.ts",
  );
  const flags = [
    "delegationOccurred",
    "providerInvoked",
    "forgeInvoked",
    "executionStarted",
  ] as const;

  for (const flag of flags) {
    const path = "src/automation/orchestrator/delegation-dispatch/types.ts";
    const fixture = sources({
      path,
      source: sourceToMutate.replace(
        `status: "prepared";\n      target: AutomationOrchestratorDelegationDispatchTarget;\n      evidence: readonly AutomationOrchestratorDelegationDispatchEvidence[];\n      dispatchOccurred: false;\n      delegationOccurred: false;\n      providerInvoked: false;\n      forgeInvoked: false;\n      executionStarted: false;`,
        `status: "prepared";\n      target: AutomationOrchestratorDelegationDispatchTarget;\n      evidence: readonly AutomationOrchestratorDelegationDispatchEvidence[];\n      dispatchOccurred: false;\n      delegationOccurred: ${flag === "delegationOccurred"};\n      providerInvoked: ${flag === "providerInvoked"};\n      forgeInvoked: ${flag === "forgeInvoked"};\n      executionStarted: ${flag === "executionStarted"};`,
      ),
    });

    assert.deepEqual(
      inspectAutomationOrchestratorDelegationDispatchContracts(fixture),
      [
        {
          path,
          reason:
            "orchestrator_delegation_dispatch_contract_contains_implementation_forbidden_dependency_or_operational_decision",
        },
      ],
      flag,
    );
  }
});

test("Automation contract inspectors reject missing evidence modeled as prepared", () => {
  const path = "src/automation/orchestrator/delegation-dispatch/types.ts";
  const fixture = sources({
    path,
    source: source(path).replace(
      'status: "indeterminate";',
      'status: "prepared";',
    ),
  });

  assert.deepEqual(
    inspectAutomationOrchestratorDelegationDispatchContracts(fixture),
    [
      {
        path,
        reason:
          "orchestrator_delegation_dispatch_contract_contains_implementation_forbidden_dependency_or_operational_decision",
      },
    ],
  );
});

test("Automation contract inspectors reject planning effects and mutable registries", () => {
  const path = "src/automation/orchestrator/planning/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nlet planRegistry: unknown;\nprocess.cwd();\nreadFileSync("plan");`,
  });

  assert.deepEqual(inspectAutomationPurity(fixture), [
    {
      path,
      reason: "automation_contract_contains_effect_or_mutable_global",
    },
  ]);
});

test("Automation contract inspectors reject evaluation behavior and dependencies", () => {
  const path = "src/automation/orchestrator/evaluation/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nexport function evaluate(): null { return null; }\nimport type { Core } from "../../../core/index.js";`,
  });

  assert.deepEqual(inspectAutomationOrchestratorEvaluationContracts(fixture), [
    {
      path,
      reason:
        "orchestrator_evaluation_contract_contains_implementation_or_forbidden_dependency",
    },
  ]);
  assert.deepEqual(inspectAutomationDependencyDirection(fixture), [
    {
      path,
      reason: "automation_dependency_direction_violation",
    },
  ]);
  assert.deepEqual(inspectAutomationForbiddenDependencies(fixture), [
    {
      path,
      reason: "forbidden_automation_dependency:../../../core/index.js",
    },
  ]);
});

test("Automation contract inspectors reject evaluation effects and mutable globals", () => {
  const path = "src/automation/orchestrator/evaluation/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nlet evaluation: unknown;\nprocess.cwd();`,
  });

  assert.deepEqual(inspectAutomationPurity(fixture), [
    {
      path,
      reason: "automation_contract_contains_effect_or_mutable_global",
    },
  ]);
});

test("Automation contract inspectors reject forbidden Core dependencies", () => {
  const path = "src/automation/provider/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nimport type { Core } from "../../core/index.js";`,
  });

  assert.deepEqual(inspectAutomationForbiddenDependencies(fixture), [
    {
      path,
      reason: "forbidden_automation_dependency:../../core/index.js",
    },
  ]);
  assert.deepEqual(inspectAutomationDependencyDirection(fixture), [
    {
      path,
      reason: "automation_dependency_direction_violation",
    },
  ]);
});

test("Automation contract inspectors reject vendor-specific provider dependencies", () => {
  const path = "src/automation/provider/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nimport type { VendorRequest } from "vendor-sdk";`,
  });

  assert.deepEqual(inspectAutomationProviderContracts(fixture), [
    {
      path,
      reason: "provider_contract_contains_concrete_or_vendor_dependency",
    },
  ]);
});

test("Automation contract inspectors reject policy evaluation behavior", () => {
  const path = "src/automation/policy/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nexport function evaluatePolicy(): null { return null; }`,
  });

  assert.deepEqual(inspectAutomationPolicyContracts(fixture), [
    {
      path,
      reason:
        "policy_contract_contains_evaluator_implementation_or_rules_engine",
    },
  ]);
});

test("Automation contract inspectors reject concrete assembly functions", () => {
  const path = "src/automation/assembly/types.ts";
  const fixture = sources({
    path,
    source: `${source(path)}\nexport function createAutomationAssembly(): null { return null; }`,
  });

  assert.deepEqual(inspectAutomationAssemblyInertness(fixture), [
    {
      path,
      reason: "assembly_contract_contains_runtime_composition",
    },
  ]);
});

test("Automation contract inspectors reject mutable registries and effects", () => {
  const forgePath = "src/automation/forge/types.ts";
  const processPath = "src/automation/provider/types.ts";
  const filesystemPath = "src/automation/policy/types.ts";

  assert.deepEqual(
    inspectAutomationPurity(
      sources({
        path: forgePath,
        source: `${source(forgePath)}\nlet registry: unknown;`,
      }),
    ),
    [
      {
        path: forgePath,
        reason: "automation_contract_contains_effect_or_mutable_global",
      },
    ],
  );
  assert.deepEqual(
    inspectAutomationPurity(
      sources({
        path: processPath,
        source: `${source(processPath)}\nprocess.cwd();`,
      }),
    ),
    [
      {
        path: processPath,
        reason: "automation_contract_contains_effect_or_mutable_global",
      },
    ],
  );
  assert.deepEqual(
    inspectAutomationPurity(
      sources({
        path: filesystemPath,
        source: `${source(filesystemPath)}\nreadFileSync("contracts");`,
      }),
    ),
    [
      {
        path: filesystemPath,
        reason: "automation_contract_contains_effect_or_mutable_global",
      },
    ],
  );
});

test("AUDIT-503 through AUDIT-512 are registered, passing, and profile-covered", () => {
  const rules = [
    AUTOMATION_CORE_CONTRACTS_RULE,
    AUTOMATION_PROVIDER_CONTRACTS_RULE,
    AUTOMATION_FORGE_CONTRACTS_RULE,
    AUTOMATION_POLICY_CONTRACTS_RULE,
    AUTOMATION_ASSEMBLY_CONTRACTS_RULE,
    AUTOMATION_ASSEMBLY_INERTNESS_RULE,
    AUTOMATION_CONTRACT_PURITY_RULE,
    AUTOMATION_DEPENDENCY_DIRECTION_RULE,
    AUTOMATION_FORBIDDEN_DEPENDENCIES_RULE,
    AUTOMATION_AUDIT_DOCUMENTATION_RULE,
  ];
  const expectedIds = Array.from(
    { length: 10 },
    (_, index) => `AUDIT-${503 + index}`,
  );

  assert.deepEqual(
    rules.map((rule) => rule.id),
    expectedIds,
  );
  for (const rule of rules) {
    assert.equal(
      AUDIT_RULES.find(({ id }) => id === rule.id)?.title,
      rule.title,
    );
    assert.equal(rule.check().status, "pass");
  }

  assert.deepEqual(
    selectAuditRulesForProfile("architecture", AUDIT_RULES)
      .filter((rule) => /^AUDIT-50[3-9]$|^AUDIT-510$|^AUDIT-511$/.test(rule.id))
      .map((rule) => rule.id),
    expectedIds.slice(0, 9),
  );
  assert.deepEqual(
    selectAuditRulesForProfile("docs", AUDIT_RULES)
      .filter((rule) => rule.id === "AUDIT-512")
      .map((rule) => rule.id),
    ["AUDIT-512"],
  );
  assert.deepEqual(
    selectAuditRulesForProfile("strict", AUDIT_RULES)
      .filter((rule) => expectedIds.includes(rule.id))
      .map((rule) => rule.id),
    expectedIds,
  );
});
