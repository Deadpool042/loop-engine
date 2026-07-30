import type { MinimalContextPackage } from "../context/types.js";
import type { RoadmapCandidate } from "../intelligence/roadmap.js";
import type { AgentPolicyResolution } from "../policy/types.js";
import type { LoopExecutionPlanEvidence } from "./execution-plan-evidence.js";
import type { LoopExecutionPlanFingerprint } from "./execution-plan-evidence-fingerprint.js";

export const LOOP_RUN_MODES = ["plan", "execute", "commit", "publish"] as const;
export type LoopRunMode = (typeof LOOP_RUN_MODES)[number];

export const LOOP_RUN_STATUSES = [
  "idle", "planning", "ready", "executing", "validating", "repairing",
  "completed", "blocked", "failed", "cancelled",
] as const;
export type LoopRunStatus = (typeof LOOP_RUN_STATUSES)[number];
export type LoopRunStepStatus = "completed" | "blocked" | "failed";
export type LoopRunStep = Readonly<{
  name: string;
  status: LoopRunStepStatus;
  startedAt: string;
  completedAt: string;
  details: readonly string[];
}>;
export type LoopRunFailure = Readonly<{
  code: string;
  message: string;
  details: readonly string[];
}>;
export type LoopRunValidation = Readonly<{
  status: "passed" | "failed";
  attempts: number;
  repairAttempts: number;
  commands: readonly string[];
  failedCommand: string | null;
  exitCode: number;
}>;
export type LoopRunCommit = Readonly<{ sha: string; message: string }>;
export type LoopRunResult = Readonly<{
  schemaVersion: 1;
  runId: string;
  project: string;
  mode: LoopRunMode;
  status: LoopRunStatus;
  startedAt: string;
  completedAt: string | null;
  candidate: RoadmapCandidate | null;
  steps: readonly LoopRunStep[];
  validation: LoopRunValidation | null;
  modifiedFiles: readonly string[];
  commit: LoopRunCommit | null;
  publication: null;
  failure: LoopRunFailure | null;
  agentPolicy: AgentPolicyResolution | null;
  contextPackage: MinimalContextPackage | null;
  executionPlanEvidence?: LoopExecutionPlanEvidence | null;
  executionPlanFingerprint?: LoopExecutionPlanFingerprint | null;
}>;
