import type { CliInvocationResult } from "../cli-invoker.js";

export type LoopDesktopApi = Readonly<{
  summary: () => Promise<CliInvocationResult>;
  context: (projectName: string) => Promise<CliInvocationResult>;
  review: (projectName: string) => Promise<CliInvocationResult>;
}>;

export function createLoopDesktopApi(
  invoke: (
    channel: "loop:summary" | "loop:context" | "loop:review",
    projectName?: string,
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
  });
}
