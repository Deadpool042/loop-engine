import type { AgentEffort } from "../agents/types.js";
import type { LoopRuntimePublicRequest } from "./loop-runtime-public-request.js";
import type {
  LoopRuntimePublicRequestResolution,
} from "./loop-runtime-public-request-resolution.js";

export type LoopRuntimeResolvedPolicyConfiguration = Readonly<{
  policyRef: string;
  policyId: string;
}>;

export type LoopRuntimeResolvedProfileConfiguration = Readonly<{
  profileRef: string;
  profileId: string;
  maxEffort: AgentEffort;
}>;

export type LoopRuntimeResolvedRequestConfiguration = Readonly<{
  request: LoopRuntimePublicRequest;
  policy: LoopRuntimeResolvedPolicyConfiguration;
  profile: LoopRuntimeResolvedProfileConfiguration;
  effectiveBudget: LoopRuntimePublicRequest["budget"];
}>;

export type LoopRuntimeResolvedRequestConfigurationResult =
  | Readonly<{
      configured: true;
      configuration: LoopRuntimeResolvedRequestConfiguration;
    }>
  | Readonly<{
      configured: false;
      reason: "unresolved_request";
    }>;

function unresolvedRequest(): LoopRuntimeResolvedRequestConfigurationResult {
  return Object.freeze({
    configured: false,
    reason: "unresolved_request" as const,
  });
}

export function createLoopRuntimeResolvedRequestConfiguration(
  resolution: LoopRuntimePublicRequestResolution<
    LoopRuntimeResolvedPolicyConfiguration,
    LoopRuntimeResolvedProfileConfiguration
  >,
): LoopRuntimeResolvedRequestConfigurationResult {
  if (!resolution.resolved) {
    return unresolvedRequest();
  }

  return Object.freeze({
    configured: true as const,
    configuration: Object.freeze({
      request: resolution.request,
      policy: Object.freeze({
        policyRef: resolution.request.policyRef,
        policyId: resolution.policy.policyId,
      }),
      profile: Object.freeze({
        profileRef: resolution.request.profileRef,
        profileId: resolution.profile.profileId,
        maxEffort: resolution.profile.maxEffort,
      }),
      effectiveBudget: resolution.request.budget,
    }),
  });
}
