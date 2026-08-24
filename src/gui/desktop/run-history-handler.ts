import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";

/** Fixed at the trusted desktop boundary; the renderer cannot change it. */
export const DESKTOP_RUN_HISTORY_LIMIT = 20;

export function createRunHistoryHandler(options: {
  cliInvoker: CliInvoker;
  resolveRepositoryPath: () => string | null;
}): (projectName: unknown) => Promise<CliInvocationResult> {
  return async (projectName) => {
    if (typeof projectName !== "string") {
      return Object.freeze({
        ok: false as const,
        kind: "spawn-error" as const,
        raw: "Project name must be a string.",
      });
    }

    const repositoryPath = options.resolveRepositoryPath();
    if (repositoryPath === null) {
      return Object.freeze({
        ok: false as const,
        kind: "spawn-error" as const,
        raw: "Loop Engine repository could not be resolved.",
      });
    }

    return options.cliInvoker.invoke(
      "runs",
      [projectName, "--limit", String(DESKTOP_RUN_HISTORY_LIMIT)],
      repositoryPath,
    );
  };
}
