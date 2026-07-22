// ExecutionReviewGate (V11.3) is a declarative review boundary before any
// future execution handoff. It records reviewed references only.

import type {
  AuthorizationConfigurationId,
  AuthorizationConfigurationMetadata,
} from "../authorization/types.js";
import type { ExecutableMappingId } from "../providers/mapping/types.js";
import type { TransportIntentId } from "../providers/intent/types.js";
import type { ProviderId } from "../providers/types.js";
import type { CapabilityId, PolicyId } from "../policy/types.js";
import type { RuntimeId } from "../runtime/types.js";
import type { TransportId } from "../transports/types.js";
import type {
  TransportRequest,
  TransportRequestId,
} from "../transport-request/types.js";

export type ExecutionReviewId = string;
export type ReviewedTransportRequestMetadata =
  AuthorizationConfigurationMetadata;
export type ExecutionReviewMetadata = ReviewedTransportRequestMetadata;

export const EXECUTION_REVIEW_STATUSES = ["reviewed", "rejected"] as const;
export type ExecutionReviewStatus = (typeof EXECUTION_REVIEW_STATUSES)[number];

export const REVIEWED_TRANSPORT_REQUEST_STATUSES = [
  "not_approved",
  "not_dispatchable",
  "not_executable",
  "handoff_denied",
  "invalid",
] as const;

export type ReviewedTransportRequestStatus =
  (typeof REVIEWED_TRANSPORT_REQUEST_STATUSES)[number];

export const EXECUTION_REVIEW_ERROR_CODES = [
  "review_missing",
  "review_required",
  "review_incomplete",
  "review_not_approved",
  "review_version_mismatch",
  "review_configuration_mismatch",
  "review_policy_mismatch",
  "review_validation_failed",
] as const;

export type ExecutionReviewErrorCode =
  (typeof EXECUTION_REVIEW_ERROR_CODES)[number];

export type ExecutionReviewError = Readonly<{
  code: ExecutionReviewErrorCode;
  message: string;
  details: ExecutionReviewMetadata;
  executionStarted: false;
}>;

export type ExecutionReviewDiagnostic = Readonly<{
  code: ExecutionReviewErrorCode;
  message: string;
  details: ExecutionReviewMetadata;
}>;

export type ExecutionReviewValidation = Readonly<{
  valid: boolean;
  diagnostics: readonly ExecutionReviewDiagnostic[];
  error?: ExecutionReviewError;
}>;

export type ExecutionReviewSummary = Readonly<{
  requestReferenced: boolean;
  authorizationConsistent: boolean;
  configurationConsistent: boolean;
  policyConsistent: boolean;
  mappingConsistent: boolean;
  intentConsistent: boolean;
  runtimeConsistent: boolean;
  transportConsistent: boolean;
  capabilityConsistent: boolean;
  reviewRequired: boolean;
  authorizationApproved: boolean;
  versionCompatible: boolean;
  reviewedImmutable: boolean;
  approved: false;
  dispatchable: false;
  executable: false;
  handoffAllowed: false;
}>;

export type ExecutionReview = Readonly<{
  id: ExecutionReviewId;
  requestId: TransportRequestId;
  configurationId: AuthorizationConfigurationId;
  status: ExecutionReviewStatus;
  metadata: ExecutionReviewMetadata;
  executionStarted: false;
}>;

export type ReviewedTransportRequest = Readonly<{
  id: TransportRequestId;
  reviewId: ExecutionReviewId;
  status: ReviewedTransportRequestStatus;
  sourceRequest: TransportRequest;
  providerId: ProviderId;
  mappingId: ExecutableMappingId;
  intentId: TransportIntentId;
  runtimeId: RuntimeId;
  transportId: TransportId;
  capabilityIds: readonly CapabilityId[];
  policyId: PolicyId;
  configurationId: AuthorizationConfigurationId;
  metadata: ReviewedTransportRequestMetadata;
  approved: false;
  dispatchable: false;
  executable: false;
  handoffAllowed: false;
  executionStarted: false;
}>;

export type ExecutionReviewResult = Readonly<{
  status: ExecutionReviewStatus;
  review: ExecutionReview;
  request: ReviewedTransportRequest | null;
  summary: ExecutionReviewSummary;
  validation: ExecutionReviewValidation;
  diagnostics: readonly ExecutionReviewDiagnostic[];
  metadata: ExecutionReviewMetadata;
  error?: ExecutionReviewError;
  executionStarted: false;
}>;
