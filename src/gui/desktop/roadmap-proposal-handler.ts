import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";
import type { ProviderKeychainReader } from "../keychain-reader.js";

export const DESKTOP_ROADMAP_PROPOSAL_TIMEOUT_MS = 60_000;

function failure(raw: string): CliInvocationResult {
  return Object.freeze({
    ok: false as const,
    kind: "spawn-error" as const,
    raw,
  });
}

export function createRoadmapProposalHandler(options: {
  cliInvoker: CliInvoker;
  resolveRepositoryPath: () => string | null;
  keychainReader: ProviderKeychainReader;
}): (projectName: unknown) => Promise<CliInvocationResult> {
  return async (projectName) => {
    if (typeof projectName !== "string") {
      return failure("Project name must be a string.");
    }

    const repositoryPath = options.resolveRepositoryPath();
    if (repositoryPath === null) {
      return failure("Loop Engine repository could not be resolved.");
    }

    const credential = await options.keychainReader.read();
    if (!credential.ok) {
      return failure(
        "Identifiant Anthropic indisponible dans le trousseau macOS.",
      );
    }

    // No --provider-model: the CLI auto-selects model/effort via the cost-aware
    // routing policy from the deterministic proposal context (roadmap-proposal-routing.ts).
    return options.cliInvoker.invoke(
      "roadmap",
      [
        "propose",
        projectName,
        "--provider",
        "anthropic_api",
        "--provider-timeout-ms",
        String(DESKTOP_ROADMAP_PROPOSAL_TIMEOUT_MS),
      ],
      repositoryPath,
      { ANTHROPIC_API_KEY: credential.apiKey },
    );
  };
}
