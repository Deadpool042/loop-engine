import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";

export function createPlanHandler(options: {
  cliInvoker: CliInvoker;
  resolveRepositoryPath: () => string | null;
}): (projectName: unknown, candidateId: unknown) => Promise<CliInvocationResult> {
  return async (projectName, candidateId) => {
    if (typeof projectName !== "string" || typeof candidateId !== "string") {
      return Object.freeze({
        ok: false as const,
        kind: "spawn-error" as const,
        raw: "Project name and candidate ID must be strings.",
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
      "run",
      [projectName, "--candidate", candidateId, "--mode", "plan"],
      repositoryPath,
    );
  };
}
