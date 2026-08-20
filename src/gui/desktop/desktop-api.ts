import type { CliInvocationResult } from "../cli-invoker.js";
import type { DesktopExecuteRequest } from "./execute-handler.js";
import type { RoadmapProposalProfileOverride } from "./roadmap-proposal-contract.js";
import type {
  DesktopExecutionSession,
  DesktopExecutionSessionStart,
} from "./execution-session.js";

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
  roadmapProposal: (
    projectName: string,
    profileOverride: RoadmapProposalProfileOverride,
  ) => Promise<CliInvocationResult>;
  roadmapProposalEstimate: (
    projectName: string,
  ) => Promise<CliInvocationResult>;
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
      | "loop:roadmap-proposal"
      | "loop:roadmap-proposal-estimate",
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
    roadmapProposal(projectName, profileOverride) {
      return invoke("loop:roadmap-proposal", projectName, profileOverride);
    },
    roadmapProposalEstimate(projectName) {
      return invoke("loop:roadmap-proposal-estimate", projectName);
    },
  });
}
