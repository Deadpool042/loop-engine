import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";

function failure(raw: string): CliInvocationResult {
  return Object.freeze({
    ok: false as const,
    kind: "spawn-error" as const,
    raw,
  });
}

/**
 * Local, deterministic, credential-free estimate: `roadmap propose-estimate` never
 * calls the provider, so no keychain read is needed here.
 */
export function createRoadmapProposalEstimateHandler(options: {
  cliInvoker: CliInvoker;
  resolveRepositoryPath: () => string | null;
}): (projectName: unknown) => Promise<CliInvocationResult> {
  return async (projectName) => {
    if (typeof projectName !== "string") {
      return failure("Project name must be a string.");
    }

    const repositoryPath = options.resolveRepositoryPath();
    if (repositoryPath === null) {
      return failure("Loop Engine repository could not be resolved.");
    }

    return options.cliInvoker.invoke(
      "roadmap",
      ["propose-estimate", projectName],
      repositoryPath,
    );
  };
}
