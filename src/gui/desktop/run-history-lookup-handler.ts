import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";

export function createRunHistoryLookupHandler(options: {
  cliInvoker: CliInvoker;
  resolveRepositoryPath: () => string | null;
}): (projectName: unknown, runId: unknown) => Promise<CliInvocationResult> {
  return async (projectName, runId) => {
    if (
      typeof projectName !== "string" ||
      projectName.length === 0 ||
      typeof runId !== "string" ||
      runId.length === 0
    ) {
      return Object.freeze({
        ok: false as const,
        kind: "spawn-error" as const,
        raw: "Project name and run id must be non-empty strings.",
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
      [projectName, "--run-id", runId],
      repositoryPath,
    );
  };
}
