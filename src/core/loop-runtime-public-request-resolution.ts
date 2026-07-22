import {
  validateLoopRuntimePublicRequest,
  type LoopRuntimePublicRequest,
} from "./loop-runtime-public-request.js";

export type LoopRuntimeReferenceEntry<T> = Readonly<{
  ref: string;
  value: T;
}>;

export type LoopRuntimePublicRequestReferenceCatalog<
  TPolicy,
  TProfile,
> = Readonly<{
  policies: readonly LoopRuntimeReferenceEntry<TPolicy>[];
  profiles: readonly LoopRuntimeReferenceEntry<TProfile>[];
}>;

export type LoopRuntimePublicRequestResolutionFailureReason =
  | "invalid_request"
  | "unknown_policy_ref"
  | "ambiguous_policy_ref"
  | "unknown_profile_ref"
  | "ambiguous_profile_ref";

export type LoopRuntimePublicRequestResolution<TPolicy, TProfile> =
  | Readonly<{
      resolved: true;
      request: LoopRuntimePublicRequest;
      policy: TPolicy;
      profile: TProfile;
    }>
  | Readonly<{
      resolved: false;
      reason: LoopRuntimePublicRequestResolutionFailureReason;
    }>;

function frozenFailure(
  reason: LoopRuntimePublicRequestResolutionFailureReason,
): LoopRuntimePublicRequestResolution<never, never> {
  return Object.freeze({
    resolved: false,
    reason,
  });
}

function selectExactMatch<T>(
  entries: readonly LoopRuntimeReferenceEntry<T>[],
  ref: string,
): readonly LoopRuntimeReferenceEntry<T>[] {
  return entries.filter((entry) => entry.ref === ref);
}

export function resolveLoopRuntimePublicRequestReferences<
  TPolicy,
  TProfile,
>(
  request: LoopRuntimePublicRequest,
  catalog: LoopRuntimePublicRequestReferenceCatalog<TPolicy, TProfile>,
): LoopRuntimePublicRequestResolution<TPolicy, TProfile> {
  const validation = validateLoopRuntimePublicRequest(request);

  if (!validation.valid) {
    return frozenFailure("invalid_request");
  }

  const matchingPolicies = selectExactMatch(catalog.policies, request.policyRef);

  if (matchingPolicies.length === 0) {
    return frozenFailure("unknown_policy_ref");
  }

  if (matchingPolicies.length > 1) {
    return frozenFailure("ambiguous_policy_ref");
  }

  const matchingProfiles = selectExactMatch(catalog.profiles, request.profileRef);

  if (matchingProfiles.length === 0) {
    return frozenFailure("unknown_profile_ref");
  }

  if (matchingProfiles.length > 1) {
    return frozenFailure("ambiguous_profile_ref");
  }

  const policyEntry = matchingPolicies[0]!;
  const profileEntry = matchingProfiles[0]!;

  return Object.freeze({
    resolved: true as const,
    request,
    policy: policyEntry.value,
    profile: profileEntry.value,
  });
}
