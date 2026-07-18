// DispatchDescriptor (V12.1) is the final transport-independent declarative
// artifact before the execution boundary. It is not a transport payload,
// dispatch instruction, runtime request, or executable object.

import type { HandoffEligibilityResult } from "../handoff-eligibility/types.js";

export type DispatchDescriptorId = string;
export type ExecutionAuthorityId = string;

export type DispatchDescriptorMetadata = Readonly<Record<string, unknown>>;

export const EXECUTION_AUTHORITY_STATUSES = [
  "pending",
  "granted",
  "invalid",
] as const;

export type ExecutionAuthorityStatus =
  (typeof EXECUTION_AUTHORITY_STATUSES)[number];

export type ExecutionAuthority = Readonly<{
  id: ExecutionAuthorityId;
  status: ExecutionAuthorityStatus;
  eligibilityId: HandoffEligibilityResult["eligibility"]["id"];
  reviewedRequestId: string;
  reviewId: string;
  provenanceId: string;
  policyVersion: string;
  configurationVersion: string;
  mappingVersion: string;
  protocolVersion: string;
  runtimeContractVersion: string;
  transportContractVersion: string;
  architectureRfcVersion: "rfc-execution-boundary-v12";
  metadata: DispatchDescriptorMetadata;
  approved: boolean;
  revoked: boolean;
  expired: boolean;
  executionStarted: false;
}>;

export const DISPATCH_DESCRIPTOR_STATUSES = [
  "pending",
  "validated",
  "invalid",
] as const;

export type DispatchDescriptorStatus =
  (typeof DISPATCH_DESCRIPTOR_STATUSES)[number];

export type DispatchDescriptorEvidence = Readonly<{
  eligibilityId: HandoffEligibilityResult["eligibility"]["id"];
  eligibilityDecision: HandoffEligibilityResult["decision"];
  authorityId: ExecutionAuthority["id"];
  authorityStatus: ExecutionAuthority["status"];
  reviewedRequestId: string;
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

export type DispatchDescriptor = Readonly<{
  id: DispatchDescriptorId;
  status: DispatchDescriptorStatus;
  evidence: DispatchDescriptorEvidence;
  metadata: DispatchDescriptorMetadata;
  readyForBoundary: false;
  dispatchable: false;
  executable: false;
  executionStarted: false;
}>;

export const DISPATCH_DESCRIPTOR_ERROR_CODES = [
  "dispatch_eligibility_missing",
  "dispatch_authority_missing",
  "dispatch_eligibility_invalid",
  "dispatch_authority_invalid",
  "dispatch_authority_not_granted",
  "dispatch_reference_mismatch",
  "dispatch_version_mismatch",
  "dispatch_descriptor_incomplete",
  "dispatch_executable_state_forbidden",
  "dispatch_dispatchable_state_forbidden",
  "dispatch_validation_failed",
] as const;

export type DispatchDescriptorErrorCode =
  (typeof DISPATCH_DESCRIPTOR_ERROR_CODES)[number];

export type DispatchDescriptorError = Readonly<{
  code: DispatchDescriptorErrorCode;
  message: string;
  details: DispatchDescriptorMetadata;
  executionStarted: false;
}>;

export type DispatchDescriptorDiagnostic = Readonly<{
  code: DispatchDescriptorErrorCode;
  message: string;
  details: DispatchDescriptorMetadata;
}>;

export type DispatchDescriptorValidation = Readonly<{
  valid: boolean;
  diagnostics: readonly DispatchDescriptorDiagnostic[];
  error?: DispatchDescriptorError;
}>;

export type DispatchDescriptorSummary = Readonly<{
  eligibilityReferenced: boolean;
  authorityReferenced: boolean;
  eligibilityConsistent: boolean;
  authorityConsistent: boolean;
  referencesConsistent: boolean;
  versionsConsistent: boolean;
  descriptorComplete: boolean;
  readyForBoundary: false;
  dispatchable: false;
  executable: false;
}>;

export type DispatchDescriptorResult = Readonly<{
  status: DispatchDescriptorStatus;
  descriptor: DispatchDescriptor;
  summary: DispatchDescriptorSummary;
  validation: DispatchDescriptorValidation;
  diagnostics: readonly DispatchDescriptorDiagnostic[];
  metadata: DispatchDescriptorMetadata;
  error?: DispatchDescriptorError;
  readyForBoundary: false;
  dispatchable: false;
  executable: false;
  executionStarted: false;
}>;

export type DispatchDescriptorBuilder = (
  eligibility: HandoffEligibilityResult | null,
  authority: ExecutionAuthority | null,
) => DispatchDescriptorResult;
