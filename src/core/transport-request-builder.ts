import type { AuthorizationConfiguration } from "../authorization/types.js";
import type { ProviderExecutionPlan } from "../providers/types.js";
import {
  buildTransportRequest as buildTransportRequestWithBuilder,
  normalizeTransportRequestBuild as normalizeTransportRequestBuildWithBuilder,
  summarizeTransportRequestBuild as summarizeTransportRequestBuildWithBuilder,
  validateTransportRequestBuild as validateTransportRequestBuildWithBuilder,
  type TransportRequestBuilderResult,
  type TransportRequestBuilderSummary,
  type TransportRequestBuilderValidation,
} from "../transport-request/index.js";

export function buildTransportRequest(
  providerPlan: ProviderExecutionPlan,
  authorization: AuthorizationConfiguration,
): TransportRequestBuilderResult {
  return buildTransportRequestWithBuilder(providerPlan, authorization);
}

export function validateTransportRequestBuild(
  providerPlan: ProviderExecutionPlan,
  authorization: AuthorizationConfiguration,
): TransportRequestBuilderValidation {
  return validateTransportRequestBuildWithBuilder(providerPlan, authorization);
}

export function summarizeTransportRequestBuild(
  providerPlan: ProviderExecutionPlan,
  authorization: AuthorizationConfiguration,
  result: TransportRequestBuilderResult,
): TransportRequestBuilderSummary {
  return summarizeTransportRequestBuildWithBuilder(
    providerPlan,
    authorization,
    result.request,
  );
}

export function normalizeTransportRequestBuild(
  result: TransportRequestBuilderResult,
): TransportRequestBuilderResult {
  return normalizeTransportRequestBuildWithBuilder(result);
}
