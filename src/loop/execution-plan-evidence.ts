import type {
  AgentBudget,
  AgentCapability,
  AgentEffort,
  AgentPermission,
  AgentProvider,
  AgentRuntime,
} from "../agents/types.js";
import type { AgentPolicyResolution } from "../policy/types.js";
import {
  resolveLoopRuntimeDelegationPolicy,
  type LoopRuntimeDelegationPolicy,
} from "./runtime-delegation.js";

export type LoopExecutionPlanEvidence = Readonly<{
  schemaVersion: 1;
  provider: AgentProvider;
  runtime: AgentRuntime;
  profileId: string;
  model: string;
  effort: AgentEffort;
  delegation: LoopRuntimeDelegationPolicy;
  budget: AgentBudget;
  allowedPaths?: readonly string[];
  policy: Readonly<{
    id: string;
    mode: "execute" | "commit";
    requiredCapabilities: readonly AgentCapability[];
    requiredPermissions: readonly AgentPermission[];
    rationale: readonly string[];
  }>;
}>;

/**
 * Projects the admitted execution identity into a bounded public evidence object.
 * The projection deliberately excludes project paths, context contents, prompts,
 * executable configuration and provider diagnostics.
 */
export function projectLoopExecutionPlanEvidence(
  resolution: AgentPolicyResolution | null,
  allowedPaths?: readonly string[] | null,
): LoopExecutionPlanEvidence | null {
  if (
    resolution?.status !== "resolved" ||
    resolution.selection?.outcome !== "selected" ||
    (resolution.mode !== "execute" && resolution.mode !== "commit")
  ) {
    return null;
  }

  const profile = resolution.selection.profile;
  const effort = resolution.requirements.minimumEffort;
  return Object.freeze({
    schemaVersion: 1 as const,
    provider: profile.provider,
    runtime: profile.runtime,
    profileId: profile.id,
    model: profile.model,
    // Effort reflects the resolved execution plan (policy requirements),
    // not the provider profile's own declared effort. See LoopExecutionPlan.effort.
    effort,
    delegation: resolveLoopRuntimeDelegationPolicy(effort),
    budget: Object.freeze({ ...profile.budget }),
    ...(allowedPaths === undefined || allowedPaths === null
      ? {}
      : { allowedPaths: Object.freeze([...allowedPaths].sort()) }),
    policy: Object.freeze({
      id: resolution.policyId,
      mode: resolution.mode,
      requiredCapabilities: Object.freeze([
        ...resolution.requirements.requiredCapabilities,
      ]),
      requiredPermissions: Object.freeze([
        ...resolution.requirements.requiredPermissions,
      ]),
      rationale: Object.freeze([
        ...resolution.requirements.rationale,
        ...resolution.reasons,
      ]),
    }),
  });
}
