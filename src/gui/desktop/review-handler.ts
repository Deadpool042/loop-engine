import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";

export function createReviewHandler(options: {
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

    return options.cliInvoker.invoke("review", [projectName], repositoryPath);
  };
}
