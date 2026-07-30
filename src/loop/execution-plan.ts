import type {
  AgentBudget,
  AgentCapability,
  AgentEffort,
  AgentPermission,
  AgentProfile,
  AgentProvider,
  AgentRuntime,
} from "../agents/types.js";
import type { MinimalContextPackage } from "../context/types.js";
import type { ProjectConfig } from "../core/config.js";
import type { RoadmapCandidate } from "../intelligence/roadmap.js";
import type {
  AgentPolicyMode,
  AgentPolicyResolution,
} from "../policy/types.js";

export type CreateLoopExecutionPlanInput = Readonly<{
  runId: string;
  project: ProjectConfig;
  candidate: RoadmapCandidate;
  agentPolicy: AgentPolicyResolution;
  contextPackage: MinimalContextPackage;
}>;

export type LoopExecutionPlan = Readonly<{
  schemaVersion: 1;
  runId: string;
  project: ProjectConfig;
  candidate: RoadmapCandidate;
  contextPackage: MinimalContextPackage;
  provider: AgentProvider;
  runtime: AgentRuntime;
  profileId: string;
  model: string;
  effort: AgentEffort;
  budget: AgentBudget;
  policy: Readonly<{
    id: string;
    mode: AgentPolicyMode;
    status: "resolved";
    requiredCapabilities: readonly AgentCapability[];
    requiredPermissions: readonly AgentPermission[];
    rationale: readonly string[];
  }>;
}>;

type SelectedAgentPolicyResolution = AgentPolicyResolution &
  Readonly<{
    status: "resolved";
    selection: Readonly<{
      outcome: "selected";
      profile: AgentProfile;
      rejected: readonly unknown[];
    }>;
  }>;

function selectedResolution(
  resolution: AgentPolicyResolution,
): resolution is SelectedAgentPolicyResolution {
  return (
    resolution.status === "resolved" &&
    resolution.selection?.outcome === "selected"
  );
}

/**
 * Converts one admitted policy decision into an immutable, serializable
 * execution plan. This function performs no I/O and never widens policy.
 */
export function createLoopExecutionPlan(
  input: CreateLoopExecutionPlanInput,
): LoopExecutionPlan {
  if (!selectedResolution(input.agentPolicy)) {
    throw new TypeError(
      "Loop execution plan requires a resolved selected agent policy.",
    );
  }

  const profile = input.agentPolicy.selection.profile;
  return Object.freeze({
    schemaVersion: 1 as const,
    runId: input.runId,
    project: input.project,
    candidate: input.candidate,
    contextPackage: input.contextPackage,
    provider: profile.provider,
    runtime: profile.runtime,
    profileId: profile.id,
    model: profile.model,
    effort: profile.effort,
    budget: Object.freeze({ ...profile.budget }),
    policy: Object.freeze({
      id: input.agentPolicy.policyId,
      mode: input.agentPolicy.mode,
      status: "resolved" as const,
      requiredCapabilities: Object.freeze([
        ...input.agentPolicy.requirements.requiredCapabilities,
      ]),
      requiredPermissions: Object.freeze([
        ...input.agentPolicy.requirements.requiredPermissions,
      ]),
      rationale: Object.freeze([
        ...input.agentPolicy.requirements.rationale,
        ...input.agentPolicy.reasons,
      ]),
    }),
  });
}
