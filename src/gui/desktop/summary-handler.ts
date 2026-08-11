import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";

export function createSummaryHandler(options: {
  cliInvoker: CliInvoker;
  resolveRepositoryPath: () => string | null;
}): () => Promise<CliInvocationResult> {
  return async () => {
    const repositoryPath = options.resolveRepositoryPath();
    if (repositoryPath === null) {
      return Object.freeze({
        ok: false as const,
        kind: "spawn-error" as const,
        raw: "Loop Engine repository could not be resolved.",
      });
    }

    return options.cliInvoker.invoke("summary", [], repositoryPath);
  };
}
