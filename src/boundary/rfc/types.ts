// ExecutionBoundaryRFC (V12.4) defines immutable invariant contracts for the
// execution boundary. It models required evidence only and never crosses the
// boundary.

import type { BoundaryHandoffResult } from "../types.js";

export type ExecutionBoundaryId = string;
export type ExecutionBoundaryMetadata = Readonly<Record<string, unknown>>;

export const EXECUTION_BOUNDARY_STATUSES = [
  "pending",
  "evaluated",
  "invalid",
] as const;

export type ExecutionBoundaryStatus =
  (typeof EXECUTION_BOUNDARY_STATUSES)[number];

export const EXECUTION_BOUNDARY_INVARIANT_FAMILIES = [
  "authority",
  "eligibility",
  "descriptor",
  "boundary",
  "evidence",
  "policy",
  "review",
  "configuration",
  "transport_isolation",
  "runtime_isolation",
] as const;

export type ExecutionBoundaryInvariantFamily =
  (typeof EXECUTION_BOUNDARY_INVARIANT_FAMILIES)[number];

export const EXECUTION_BOUNDARY_REQUIREMENT_OUTCOMES = [
  "pass",
  "fail",
  "unknown",
] as const;

export type ExecutionBoundaryRequirementOutcome =
  (typeof EXECUTION_BOUNDARY_REQUIREMENT_OUTCOMES)[number];

export type ExecutionBoundaryRequirement = Readonly<{
  id: string;
  family: ExecutionBoundaryInvariantFamily;
  outcome: ExecutionBoundaryRequirementOutcome;
  reason: string;
  executionStarted: false;
}>;

export type ExecutionBoundaryConstraint = Readonly<{
  id: string;
  family: ExecutionBoundaryInvariantFamily;
  required: true;
  description: string;
  executionStarted: false;
}>;

export type ExecutionBoundaryInvariant = Readonly<{
  family: ExecutionBoundaryInvariantFamily;
  satisfied: boolean;
  requirements: readonly ExecutionBoundaryRequirement[];
  constraints: readonly ExecutionBoundaryConstraint[];
  diagnostics: readonly ExecutionBoundaryDiagnostic[];
  executionStarted: false;
}>;

export type ExecutionBoundaryEvidence = Readonly<{
  handoffId: BoundaryHandoffResult["handoff"]["id"];
  descriptorId: string;
  authorityId: string;
  eligibilityId: string;
  reviewId: string;
  provenanceId: string;
  policyVersion: string;
  configurationVersion: string;
  mappingVersion: string;
  protocolVersion: string;
  runtimeContractVersion: string;
  transportContractVersion: string;
  architectureRfcVersion: "rfc-execution-boundary-v12";
  executionStarted: false;
}>;

export type ExecutionBoundaryRFC = Readonly<{
  id: ExecutionBoundaryId;
  status: ExecutionBoundaryStatus;
  evidence: ExecutionBoundaryEvidence;
  invariants: readonly ExecutionBoundaryInvariant[];
  metadata: ExecutionBoundaryMetadata;
  diagnostics: readonly ExecutionBoundaryDiagnostic[];
  boundarySatisfied: false;
  crossingAllowed: false;
  dispatchable: false;
  executable: false;
  executionStarted: false;
}>;

export const EXECUTION_BOUNDARY_ERROR_CODES = [
  "boundary_missing",
  "boundary_invalid",
  "boundary_invariant_failed",
  "boundary_review_required",
  "boundary_policy_denied",
  "boundary_not_ready",
  "boundary_configuration_missing",
  "boundary_evidence_missing",
  "boundary_not_supported",
] as const;

export type ExecutionBoundaryErrorCode =
  (typeof EXECUTION_BOUNDARY_ERROR_CODES)[number];

export type ExecutionBoundaryError = Readonly<{
  code: ExecutionBoundaryErrorCode;
  message: string;
  details: ExecutionBoundaryMetadata;
  executionStarted: false;
}>;

export type ExecutionBoundaryDiagnostic = Readonly<{
  code: ExecutionBoundaryErrorCode;
  message: string;
  details: ExecutionBoundaryMetadata;
}>;

export type ExecutionBoundaryValidation = Readonly<{
  valid: boolean;
  diagnostics: readonly ExecutionBoundaryDiagnostic[];
  error?: ExecutionBoundaryError;
}>;

export type ExecutionBoundarySummary = Readonly<{
  totalInvariants: number;
  satisfiedInvariants: number;
  failedInvariants: number;
  unknownRequirements: number;
  authoritySatisfied: boolean;
  eligibilitySatisfied: boolean;
  descriptorSatisfied: boolean;
  boundarySatisfied: false;
  evidenceSatisfied: boolean;
  policySatisfied: boolean;
  reviewSatisfied: boolean;
  configurationSatisfied: boolean;
  transportIsolated: boolean;
  runtimeIsolated: boolean;
  crossingAllowed: false;
  dispatchable: false;
  executable: false;
}>;

export type ExecutionBoundaryEvaluation = Readonly<{
  invariants: readonly ExecutionBoundaryInvariant[];
  summary: ExecutionBoundarySummary;
  validation: ExecutionBoundaryValidation;
  boundarySatisfied: false;
  crossingAllowed: false;
  dispatchable: false;
  executable: false;
  executionStarted: false;
}>;

export type ExecutionBoundaryResult = Readonly<{
  status: ExecutionBoundaryStatus;
  rfc: ExecutionBoundaryRFC;
  evaluation: ExecutionBoundaryEvaluation;
  summary: ExecutionBoundarySummary;
  validation: ExecutionBoundaryValidation;
  diagnostics: readonly ExecutionBoundaryDiagnostic[];
  metadata: ExecutionBoundaryMetadata;
  error?: ExecutionBoundaryError;
  boundarySatisfied: false;
  crossingAllowed: false;
  dispatchable: false;
  executable: false;
  executionStarted: false;
}>;

export type ExecutionBoundaryBuilder = (
  handoff: BoundaryHandoffResult | null,
) => ExecutionBoundaryResult;
