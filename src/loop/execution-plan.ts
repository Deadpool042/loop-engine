import type {
  AgentBudget,
  AgentCapability,
  AgentEffort,
  AgentFundingMode,
  AgentPermission,
  AgentProfile,
  AgentProvider,
  AgentRuntime,
} from "../agents/types.js";
import type { MinimalContextPackage } from "../context/types.js";
import {
  resolveLoopRuntimeDelegationPolicy,
  type LoopRuntimeDelegationPolicy,
} from "./runtime-delegation.js";
import type { RoadmapCandidate } from "../intelligence/roadmap.js";
import type {
  AgentPolicyMode,
  AgentPolicyResolution,
} from "../policy/types.js";

/**
 * The plan's only project identity: the logical name consumed by executor
 * prompts. Never the physical checkout location — see LoopExecutor's cwd
 * parameter (docs/architecture/job-package-portable-contract.md).
 */
export type LoopExecutionPlanProject = Readonly<{ name: string }>;

export type CreateLoopExecutionPlanInput = Readonly<{
  runId: string;
  project: LoopExecutionPlanProject;
  candidate: RoadmapCandidate;
  agentPolicy: AgentPolicyResolution;
  contextPackage: MinimalContextPackage;
  allowedPaths?: readonly string[];
  brief?: Readonly<{
    objective: string;
    deliverables: readonly string[];
    outOfScope: readonly string[];
    forbiddenContentTerms?: readonly string[];
  }>;
}>;

export type LoopExecutionPlan = Readonly<{
  schemaVersion: 1;
  runId: string;
  project: LoopExecutionPlanProject;
  candidate: RoadmapCandidate;
  contextPackage: MinimalContextPackage;
  allowedPaths?: readonly string[];
  brief?: Readonly<{
    objective: string;
    deliverables: readonly string[];
    outOfScope: readonly string[];
    forbiddenContentTerms?: readonly string[];
  }>;
  provider: AgentProvider;
  runtime: AgentRuntime;
  profileId: string;
  model: string;
  effort: AgentEffort;
  delegation: LoopRuntimeDelegationPolicy;
  budget: AgentBudget;
  policy: Readonly<{
    id: string;
    mode: AgentPolicyMode;
    status: "resolved";
    requiredCapabilities: readonly AgentCapability[];
    requiredPermissions: readonly AgentPermission[];
    allowedFundingModes?: readonly AgentFundingMode[];
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
  const effort = input.agentPolicy.requirements.minimumEffort;
  return Object.freeze({
    schemaVersion: 1 as const,
    runId: input.runId,
    project: Object.freeze({ name: input.project.name }),
    candidate: input.candidate,
    contextPackage: input.contextPackage,
    ...(input.allowedPaths === undefined
      ? {}
      : { allowedPaths: Object.freeze([...input.allowedPaths]) }),
    ...(input.brief === undefined
      ? {}
      : {
          brief: Object.freeze({
            objective: input.brief.objective,
            deliverables: Object.freeze([...input.brief.deliverables]),
            outOfScope: Object.freeze([...input.brief.outOfScope]),
            ...(input.brief.forbiddenContentTerms === undefined
              ? {}
              : {
                  forbiddenContentTerms: Object.freeze([
                    ...input.brief.forbiddenContentTerms,
                  ]),
                }),
          }),
        }),
    provider: profile.provider,
    runtime: profile.runtime,
    profileId: profile.id,
    model: profile.model,
    // Effort belongs to this invocation. The selected provider profile only
    // supplies runtime capabilities and a deterministic ranking preference.
    effort,
    delegation: resolveLoopRuntimeDelegationPolicy(effort),
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
      ...(input.agentPolicy.selectionRequest.allowedFundingModes === undefined
        ? {}
        : {
            allowedFundingModes: Object.freeze([
              ...input.agentPolicy.selectionRequest.allowedFundingModes,
            ]),
          }),
      rationale: Object.freeze([
        ...input.agentPolicy.requirements.rationale,
        ...input.agentPolicy.reasons,
      ]),
    }),
  });
}
