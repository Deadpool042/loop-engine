import type {
  AgentBudget,
  AgentCapability,
  AgentEffort,
  AgentPermission,
  AgentProvider,
  AgentRuntime,
} from "../agents/types.js";
import type { AgentPolicyResolution } from "../policy/types.js";

export type LoopExecutionPlanEvidence = Readonly<{
  schemaVersion: 1;
  provider: AgentProvider;
  runtime: AgentRuntime;
  profileId: string;
  model: string;
  effort: AgentEffort;
  budget: AgentBudget;
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
): LoopExecutionPlanEvidence | null {
  if (
    resolution?.status !== "resolved" ||
    resolution.selection?.outcome !== "selected" ||
    (resolution.mode !== "execute" && resolution.mode !== "commit")
  ) {
    return null;
  }

  const profile = resolution.selection.profile;
  return Object.freeze({
    schemaVersion: 1 as const,
    provider: profile.provider,
    runtime: profile.runtime,
    profileId: profile.id,
    model: profile.model,
    effort: profile.effort,
    budget: Object.freeze({ ...profile.budget }),
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
