import type { BoundaryHandoffResult } from "../types.js";
import { freezeReviewArchitectureValue } from "../../review-architecture/shared.js";
import {
  EXECUTION_BOUNDARY_INVARIANT_FAMILIES,
  type ExecutionBoundaryConstraint,
  type ExecutionBoundaryEvidence,
  type ExecutionBoundaryInvariant,
  type ExecutionBoundaryInvariantFamily,
  type ExecutionBoundaryMetadata,
  type ExecutionBoundaryRequirement,
  type ExecutionBoundaryRequirementOutcome,
  type ExecutionBoundaryRFC,
  type ExecutionBoundaryStatus,
  type ExecutionBoundarySummary,
} from "./types.js";

const RFC_VERSION = "rfc-execution-boundary-v12" as const;

const INVARIANT_DESCRIPTIONS: Record<ExecutionBoundaryInvariantFamily, string> =
  {
    authority: "Execution authority evidence is explicit, approved, and scoped.",
    eligibility: "Handoff eligibility evidence is explicit and non-inferred.",
    descriptor: "Dispatch descriptor evidence is complete and inert.",
    boundary: "Boundary handoff state remains declarative and not ready.",
    evidence: "Required evidence references and versions are present.",
    policy: "Policy evidence is explicit and default-deny safe.",
    review: "Review evidence is present and explicit.",
    configuration: "Configuration evidence is present and versioned.",
    transport_isolation:
      "The boundary RFC is isolated from transport implementations and payloads.",
    runtime_isolation:
      "The boundary RFC is isolated from runtime implementations and payloads.",
  };

export function freezeExecutionBoundaryValue<T>(value: T): T {
  return freezeReviewArchitectureValue(value);
}

export function executionBoundaryIdFor(
  handoff: BoundaryHandoffResult | null,
): string {
  return `execution-boundary-rfc.${handoff?.handoff.id ?? "missing"}`;
}

function emptyEvidence(): ExecutionBoundaryEvidence {
  return freezeExecutionBoundaryValue({
    handoffId: "",
    descriptorId: "",
    authorityId: "",
    eligibilityId: "",
    reviewId: "",
    provenanceId: "",
    policyVersion: "",
    configurationVersion: "",
    mappingVersion: "",
    protocolVersion: "",
    runtimeContractVersion: "",
    transportContractVersion: "",
    architectureRfcVersion: RFC_VERSION,
    executionStarted: false,
  });
}

export function evidenceFor(
  handoff: BoundaryHandoffResult | null,
): ExecutionBoundaryEvidence {
  if (!handoff) return emptyEvidence();
  const evidence = handoff.handoff.evidence;
  return freezeExecutionBoundaryValue({
    handoffId: handoff.handoff.id,
    descriptorId: evidence.descriptorId,
    authorityId: evidence.authorityId,
    eligibilityId: evidence.eligibilityId,
    reviewId: evidence.reviewId,
    provenanceId: evidence.provenanceId,
    policyVersion: evidence.policyVersion,
    configurationVersion: evidence.configurationVersion,
    mappingVersion: evidence.mappingVersion,
    protocolVersion: evidence.protocolVersion,
    runtimeContractVersion: evidence.runtimeContractVersion,
    transportContractVersion: evidence.transportContractVersion,
    architectureRfcVersion: evidence.architectureRfcVersion,
    executionStarted: false,
  });
}

export function metadataFor(
  handoff: BoundaryHandoffResult | null,
): ExecutionBoundaryMetadata {
  return freezeExecutionBoundaryValue({
    ...(handoff?.metadata ?? {}),
    boundaryRfc: "declarative",
  });
}

function requirement(
  family: ExecutionBoundaryInvariantFamily,
  id: string,
  outcome: ExecutionBoundaryRequirementOutcome,
  reason: string,
): ExecutionBoundaryRequirement {
  return freezeExecutionBoundaryValue({
    id,
    family,
    outcome,
    reason,
    executionStarted: false,
  });
}

function constraint(
  family: ExecutionBoundaryInvariantFamily,
): ExecutionBoundaryConstraint {
  return freezeExecutionBoundaryValue({
    id: `${family}_required`,
    family,
    required: true,
    description: INVARIANT_DESCRIPTIONS[family],
    executionStarted: false,
  });
}

function hasValue(value: string): boolean {
  return value.length > 0;
}

function outcomeFrom(value: boolean): ExecutionBoundaryRequirementOutcome {
  return value ? "pass" : "fail";
}

function invariantRequirements(
  family: ExecutionBoundaryInvariantFamily,
  handoff: BoundaryHandoffResult | null,
  evidence: ExecutionBoundaryEvidence,
): readonly ExecutionBoundaryRequirement[] {
  if (!handoff) {
    return freezeExecutionBoundaryValue([
      requirement(
        family,
        `${family}_evidence_present`,
        "unknown",
        "BoundaryHandoffResult is missing.",
      ),
    ]);
  }
  const handoffValue = handoff.handoff;
  const map: Record<
    ExecutionBoundaryInvariantFamily,
    readonly ExecutionBoundaryRequirement[]
  > = {
    authority: [
      requirement(
        family,
        "authority_present",
        outcomeFrom(hasValue(evidence.authorityId)),
        "Authority evidence must be referenced.",
      ),
      requirement(
        family,
        "authority_not_executable",
        outcomeFrom(!handoffValue.executable && !handoff.executable),
        "Authority evidence must not imply executability.",
      ),
    ],
    eligibility: [
      requirement(
        family,
        "eligibility_present",
        outcomeFrom(hasValue(evidence.eligibilityId)),
        "Eligibility evidence must be referenced.",
      ),
      requirement(
        family,
        "eligibility_not_dispatchable",
        outcomeFrom(!handoffValue.dispatchable && !handoff.dispatchable),
        "Eligibility evidence must not imply dispatch.",
      ),
    ],
    descriptor: [
      requirement(
        family,
        "descriptor_present",
        outcomeFrom(hasValue(evidence.descriptorId)),
        "Descriptor evidence must be referenced.",
      ),
      requirement(
        family,
        "descriptor_not_accepted",
        outcomeFrom(!handoffValue.accepted),
        "Descriptor evidence must not be accepted as a payload.",
      ),
    ],
    boundary: [
      requirement(
        family,
        "boundary_handoff_valid",
        outcomeFrom(handoff.validation.valid && handoff.status === "validated"),
        "BoundaryHandoffResult must be valid before boundary RFC evaluation.",
      ),
      requirement(
        family,
        "boundary_not_ready",
        outcomeFrom(!handoffValue.ready && !handoff.ready),
        "Boundary handoff must remain below the execution boundary.",
      ),
    ],
    evidence: [
      requirement(
        family,
        "evidence_references_present",
        outcomeFrom(
          [
            evidence.handoffId,
            evidence.descriptorId,
            evidence.authorityId,
            evidence.eligibilityId,
            evidence.reviewId,
            evidence.provenanceId,
          ].every(hasValue),
        ),
        "Evidence references must be complete.",
      ),
      requirement(
        family,
        "evidence_versions_present",
        outcomeFrom(
          [
            evidence.policyVersion,
            evidence.configurationVersion,
            evidence.mappingVersion,
            evidence.protocolVersion,
            evidence.runtimeContractVersion,
            evidence.transportContractVersion,
          ].every(hasValue),
        ),
        "Evidence versions must be complete.",
      ),
    ],
    policy: [
      requirement(
        family,
        "policy_present",
        outcomeFrom(hasValue(evidence.policyVersion)),
        "Policy version must be present.",
      ),
      requirement(
        family,
        "policy_no_crossing",
        outcomeFrom(!handoff.ready && !handoff.accepted),
        "Policy evidence must not grant boundary crossing.",
      ),
    ],
    review: [
      requirement(
        family,
        "review_present",
        outcomeFrom(hasValue(evidence.reviewId)),
        "Review evidence must be present.",
      ),
      requirement(
        family,
        "provenance_present",
        outcomeFrom(hasValue(evidence.provenanceId)),
        "Approval provenance evidence must be present.",
      ),
    ],
    configuration: [
      requirement(
        family,
        "configuration_present",
        outcomeFrom(hasValue(evidence.configurationVersion)),
        "Configuration version must be present.",
      ),
      requirement(
        family,
        "configuration_metadata_present",
        outcomeFrom(Object.keys(handoff.metadata).length > 0),
        "Configuration review metadata must be normalized.",
      ),
    ],
    transport_isolation: [
      requirement(
        family,
        "transport_contract_reference_only",
        outcomeFrom(hasValue(evidence.transportContractVersion)),
        "Transport evidence is limited to contract references.",
      ),
      requirement(
        family,
        "transport_not_started",
        outcomeFrom(!handoff.executionStarted && !handoffValue.executionStarted),
        "Transport execution must not start.",
      ),
    ],
    runtime_isolation: [
      requirement(
        family,
        "runtime_contract_reference_only",
        outcomeFrom(hasValue(evidence.runtimeContractVersion)),
        "Runtime evidence is limited to contract references.",
      ),
      requirement(
        family,
        "runtime_not_started",
        outcomeFrom(!handoff.executionStarted && !handoffValue.executionStarted),
        "Runtime execution must not start.",
      ),
    ],
  };
  return freezeExecutionBoundaryValue([...map[family]]);
}

export function invariantsFor(
  handoff: BoundaryHandoffResult | null,
): readonly ExecutionBoundaryInvariant[] {
  const evidence = evidenceFor(handoff);
  return freezeExecutionBoundaryValue(
    EXECUTION_BOUNDARY_INVARIANT_FAMILIES.map((family) => {
      const requirements = invariantRequirements(family, handoff, evidence);
      return freezeExecutionBoundaryValue({
        family,
        satisfied: requirements.every((item) => item.outcome === "pass"),
        requirements,
        constraints: freezeExecutionBoundaryValue([constraint(family)]),
        diagnostics: freezeExecutionBoundaryValue([]),
        executionStarted: false,
      });
    }),
  );
}

function invariantSatisfied(
  invariants: readonly ExecutionBoundaryInvariant[],
  family: ExecutionBoundaryInvariantFamily,
): boolean {
  return invariants.find((item) => item.family === family)?.satisfied ?? false;
}

export function summarizeExecutionBoundaryRFC(
  rfc: ExecutionBoundaryRFC,
): ExecutionBoundarySummary {
  const failedInvariants = rfc.invariants.filter(
    (item) => !item.satisfied,
  ).length;
  const unknownRequirements = rfc.invariants.flatMap(
    (item) => item.requirements,
  ).filter((item) => item.outcome === "unknown").length;
  return freezeExecutionBoundaryValue({
    totalInvariants: rfc.invariants.length,
    satisfiedInvariants: rfc.invariants.length - failedInvariants,
    failedInvariants,
    unknownRequirements,
    authoritySatisfied: invariantSatisfied(rfc.invariants, "authority"),
    eligibilitySatisfied: invariantSatisfied(rfc.invariants, "eligibility"),
    descriptorSatisfied: invariantSatisfied(rfc.invariants, "descriptor"),
    boundarySatisfied: false,
    evidenceSatisfied: invariantSatisfied(rfc.invariants, "evidence"),
    policySatisfied: invariantSatisfied(rfc.invariants, "policy"),
    reviewSatisfied: invariantSatisfied(rfc.invariants, "review"),
    configurationSatisfied: invariantSatisfied(rfc.invariants, "configuration"),
    transportIsolated: invariantSatisfied(
      rfc.invariants,
      "transport_isolation",
    ),
    runtimeIsolated: invariantSatisfied(rfc.invariants, "runtime_isolation"),
    crossingAllowed: false,
    dispatchable: false,
    executable: false,
  });
}

export function buildExecutionBoundaryRFC(
  handoff: BoundaryHandoffResult | null,
  status: ExecutionBoundaryStatus = "evaluated",
): ExecutionBoundaryRFC {
  return freezeExecutionBoundaryValue({
    id: executionBoundaryIdFor(handoff),
    status,
    evidence: evidenceFor(handoff),
    invariants: invariantsFor(handoff),
    metadata: metadataFor(handoff),
    diagnostics: freezeExecutionBoundaryValue([]),
    boundarySatisfied: false,
    crossingAllowed: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });
}
