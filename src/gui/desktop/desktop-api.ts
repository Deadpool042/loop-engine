import type { CliInvocationResult } from "../cli-invoker.js";
import type { DesktopExecuteRequest } from "./execute-handler.js";

export type LoopDesktopApi = Readonly<{
  summary: () => Promise<CliInvocationResult>;
  context: (projectName: string) => Promise<CliInvocationResult>;
  review: (projectName: string) => Promise<CliInvocationResult>;
  plan: (projectName: string, candidateId: string) => Promise<CliInvocationResult>;
  execute: (request: DesktopExecuteRequest) => Promise<CliInvocationResult>;
}>;

export function createLoopDesktopApi(
  invoke: (
    channel: "loop:summary" | "loop:context" | "loop:review" | "loop:plan" | "loop:execute",
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
  });
}
