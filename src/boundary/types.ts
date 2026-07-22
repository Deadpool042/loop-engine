// BoundaryHandoff (V12.3) is an immutable declarative object that could be
// reviewed before a future execution boundary. It performs no handoff and
// contains no operational payload.

import type { DispatchDescriptorResult } from "../dispatch/types.js";

export type BoundaryHandoffId = string;
export type BoundaryHandoffMetadata = Readonly<Record<string, unknown>>;

export const BOUNDARY_HANDOFF_STATUSES = [
  "pending",
  "validated",
  "invalid",
  "inactive",
] as const;

export type BoundaryHandoffStatus = (typeof BOUNDARY_HANDOFF_STATUSES)[number];

export type BoundaryHandoffEvidence = Readonly<{
  descriptorId: DispatchDescriptorResult["descriptor"]["id"];
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

export type BoundaryHandoff = Readonly<{
  id: BoundaryHandoffId;
  status: BoundaryHandoffStatus;
  evidence: BoundaryHandoffEvidence;
  metadata: BoundaryHandoffMetadata;
  diagnostics: readonly BoundaryHandoffDiagnostic[];
  ready: false;
  accepted: false;
  dispatchable: false;
  executable: false;
  executionStarted: false;
}>;

export type BoundaryHandoffSelection = Readonly<{
  id: BoundaryHandoffId;
  supported: boolean;
  reason: string;
  executionStarted: false;
}>;

export type BoundaryHandoffResolution = Readonly<{
  selection: BoundaryHandoffSelection;
  handoff: BoundaryHandoff | null;
  diagnostics: readonly BoundaryHandoffDiagnostic[];
  executionStarted: false;
}>;

export type BoundaryHandoffRegistry = readonly BoundaryHandoff[];

export const BOUNDARY_HANDOFF_ERROR_CODES = [
  "handoff_missing",
  "handoff_invalid",
  "handoff_inactive",
  "handoff_review_required",
  "handoff_not_authorized",
  "handoff_configuration_missing",
  "handoff_not_supported",
  "handoff_not_ready",
] as const;

export type BoundaryHandoffErrorCode =
  (typeof BOUNDARY_HANDOFF_ERROR_CODES)[number];

export type BoundaryHandoffError = Readonly<{
  code: BoundaryHandoffErrorCode;
  message: string;
  details: BoundaryHandoffMetadata;
  executionStarted: false;
}>;

export type BoundaryHandoffDiagnostic = Readonly<{
  code: BoundaryHandoffErrorCode;
  message: string;
  details: BoundaryHandoffMetadata;
}>;

export type BoundaryHandoffValidation = Readonly<{
  valid: boolean;
  diagnostics: readonly BoundaryHandoffDiagnostic[];
  error?: BoundaryHandoffError;
}>;

export type BoundaryHandoffSummary = Readonly<{
  descriptorReferenced: boolean;
  authorityReferenced: boolean;
  eligibilityReferenced: boolean;
  reviewReferenced: boolean;
  policyReferenced: boolean;
  evidenceComplete: boolean;
  diagnosticsCount: number;
  ready: false;
  accepted: false;
  dispatchable: false;
  executable: false;
}>;

export type BoundaryHandoffResult = Readonly<{
  status: BoundaryHandoffStatus;
  handoff: BoundaryHandoff;
  summary: BoundaryHandoffSummary;
  validation: BoundaryHandoffValidation;
  diagnostics: readonly BoundaryHandoffDiagnostic[];
  metadata: BoundaryHandoffMetadata;
  error?: BoundaryHandoffError;
  ready: false;
  accepted: false;
  dispatchable: false;
  executable: false;
  executionStarted: false;
}>;

export type BoundaryHandoffBuilder = (
  descriptor: DispatchDescriptorResult | null,
) => BoundaryHandoffResult;
