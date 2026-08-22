import type { CliInvocationResult } from "../cli-invoker.js";
import type { DesktopExecuteRequest } from "./execute-handler.js";
import type { RoadmapProposalProfileOverride } from "./roadmap-proposal-contract.js";
import type {
  DesktopExecutionSession,
  DesktopExecutionSessionStart,
} from "./execution-session.js";
import type { DesktopExecutionDecisionResult } from "./execution-decision-contract.js";

export type LoopDesktopApi = Readonly<{
  summary: () => Promise<CliInvocationResult>;
  context: (projectName: string) => Promise<CliInvocationResult>;
  review: (projectName: string) => Promise<CliInvocationResult>;
  plan: (
    projectName: string,
    candidateId: string,
  ) => Promise<CliInvocationResult>;
  execute: (request: DesktopExecuteRequest) => Promise<CliInvocationResult>;
  startExecution: (
    request: DesktopExecuteRequest,
  ) => Promise<DesktopExecutionSessionStart>;
  executionSession: (
    sessionId: string,
  ) => Promise<DesktopExecutionSession | null>;
  cancelExecution: (sessionId: string) => Promise<boolean>;
  roadmapProposal: (
    projectName: string,
    profileOverride: RoadmapProposalProfileOverride,
  ) => Promise<CliInvocationResult>;
  roadmapProposalEstimate: (
    projectName: string,
  ) => Promise<CliInvocationResult>;
  gateReassessment: (projectName: string, profileOverride: RoadmapProposalProfileOverride) => Promise<CliInvocationResult>;
  gateReassessmentEstimate: (projectName: string) => Promise<CliInvocationResult>;
  prepareExecutionDecision: (projectName: string) => Promise<DesktopExecutionDecisionResult>;
  approveExecutionDecision: (draftId: string) => Promise<DesktopExecutionDecisionResult>;
}>;

export function createLoopDesktopApi(
  invoke: (
    channel:
      | "loop:summary"
      | "loop:context"
      | "loop:review"
      | "loop:plan"
      | "loop:execute"
      | "loop:execution-start"
      | "loop:execution-session"
      | "loop:execution-cancel"
      | "loop:roadmap-proposal"
      | "loop:roadmap-proposal-estimate"
      | "loop:gate-reassessment"
      | "loop:gate-reassessment-estimate"
      | "loop:execution-decision-prepare"
      | "loop:execution-decision-approve",
    ...args: readonly unknown[]
  ) => Promise<CliInvocationResult>,
): LoopDesktopApi {
  return Object.freeze({
    summary() {
      return invoke("loop:summary");
    },
    context(projectName) {
      return invoke("loop:context", projectName);
    },
    review(projectName) {
      return invoke("loop:review", projectName);
    },
    plan(projectName, candidateId) {
      return invoke("loop:plan", projectName, candidateId);
    },
    execute(request) {
      return invoke("loop:execute", request);
    },
    startExecution(request) {
      return invoke(
        "loop:execution-start",
        request,
      ) as Promise<DesktopExecutionSessionStart>;
    },
    executionSession(sessionId) {
      return invoke(
        "loop:execution-session",
        sessionId,
      ) as unknown as Promise<DesktopExecutionSession | null>;
    },
    cancelExecution(sessionId) {
      return invoke(
        "loop:execution-cancel",
        sessionId,
      ) as unknown as Promise<boolean>;
    },
    roadmapProposal(projectName, profileOverride) {
      return invoke("loop:roadmap-proposal", projectName, profileOverride);
    },
    roadmapProposalEstimate(projectName) {
      return invoke("loop:roadmap-proposal-estimate", projectName);
    },
    gateReassessment(projectName, profileOverride) { return invoke("loop:gate-reassessment", projectName, profileOverride); },
    gateReassessmentEstimate(projectName) { return invoke("loop:gate-reassessment-estimate", projectName); },
    prepareExecutionDecision(projectName) { return invoke("loop:execution-decision-prepare", projectName) as unknown as Promise<DesktopExecutionDecisionResult>; },
    approveExecutionDecision(draftId) { return invoke("loop:execution-decision-approve", draftId) as unknown as Promise<DesktopExecutionDecisionResult>; },
  });
}
