// TransportRequestBuilder (V11.2) is the sole supported factory for producing
// TransportRequest objects from ProviderExecutionPlan references.

import {
  createTransportRequestBuilderError,
  createTransportRequestBuilderResult,
} from "./builder-errors.js";
import {
  buildTransportRequestFromReferences,
  summarizeTransportRequestBuild,
} from "./builder-support.js";
import { validateTransportRequestBuild } from "./builder-validation.js";
import type { AuthorizationConfiguration } from "../authorization/types.js";
import type { ProviderExecutionPlan } from "../providers/types.js";
import type {
  TransportRequest,
  TransportRequestDiagnostic,
  TransportRequestMetadata,
} from "./types.js";

export const TRANSPORT_REQUEST_BUILDER_ERROR_CODES = [
  "builder_invalid_plan",
  "builder_invalid_authorization",
  "builder_invalid_mapping",
  "builder_invalid_intent",
  "builder_invalid_runtime_reference",
  "builder_invalid_transport_reference",
  "builder_invalid_capability_reference",
  "builder_validation_failed",
] as const;

export type TransportRequestBuilderErrorCode =
  (typeof TRANSPORT_REQUEST_BUILDER_ERROR_CODES)[number];

export type TransportRequestBuilderError = Readonly<{
  code: TransportRequestBuilderErrorCode;
  message: string;
  details: TransportRequestMetadata;
  executionStarted: false;
}>;

export type TransportRequestBuilderDiagnostic = Readonly<{
  code: TransportRequestBuilderErrorCode;
  message: string;
  details: TransportRequestMetadata;
}>;

export type TransportRequestBuilderValidation = Readonly<{
  valid: boolean;
  diagnostics: readonly TransportRequestBuilderDiagnostic[];
  error?: TransportRequestBuilderError;
}>;

export type TransportRequestBuilderSummary = Readonly<{
  providerCompatible: boolean;
  mappingReferenced: boolean;
  intentReferenced: boolean;
  runtimeReferenced: boolean;
  transportReferenced: boolean;
  capabilityReferenced: boolean;
  configurationApproved: boolean;
  outputImmutable: boolean;
}>;

export type TransportRequestBuilderResult = Readonly<{
  status: "built" | "rejected";
  request: TransportRequest | null;
  summary: TransportRequestBuilderSummary;
  validation: TransportRequestBuilderValidation;
  diagnostics: readonly TransportRequestBuilderDiagnostic[];
  metadata: TransportRequestMetadata;
  error?: TransportRequestBuilderError;
  executionStarted: false;
}>;

export type TransportRequestBuilder = (
  providerPlan: ProviderExecutionPlan,
  authorization: AuthorizationConfiguration,
) => TransportRequestBuilderResult;

export const buildTransportRequest: TransportRequestBuilder = (
  providerPlan,
  authorization,
) => {
  const validation = validateTransportRequestBuild(providerPlan, authorization);
  if (!validation.valid) {
    const error =
      validation.error ??
      createTransportRequestBuilderError(
        "builder_validation_failed",
        "TransportRequestBuilder validation failed.",
      );
    return createTransportRequestBuilderResult(
      null,
      summarizeTransportRequestBuild(providerPlan, authorization, null),
      validation,
      error,
      providerPlan.metadata,
    );
  }

  const request = buildTransportRequestFromReferences(
    providerPlan,
    authorization,
  );
  const summary = summarizeTransportRequestBuild(
    providerPlan,
    authorization,
    request,
  );
  return createTransportRequestBuilderResult(
    request,
    summary,
    validation,
    undefined,
    request.metadata,
  );
};

export function normalizeTransportRequestBuild(
  result: TransportRequestBuilderResult,
): TransportRequestBuilderResult {
  return result;
}

export function diagnosticsFromTransportRequestBuild(
  result: TransportRequestBuilderResult,
): readonly TransportRequestDiagnostic[] {
  return result.diagnostics.map((diagnostic) =>
    Object.freeze({
      code: "transport_request_invalid",
      message: diagnostic.message,
      details: diagnostic.details,
    } as const),
  );
}
