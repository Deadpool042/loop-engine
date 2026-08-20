import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";
import type { ProviderKeychainReader } from "../keychain-reader.js";
import {
  ROADMAP_PROPOSAL_PROFILES,
  resolveRoadmapProposalProfile,
  type RoadmapProposalProfile,
} from "../../intelligence/roadmap-proposal-routing.js";
import type { RoadmapProposalProfileOverride } from "./roadmap-proposal-contract.js";

export const DESKTOP_ROADMAP_PROPOSAL_TIMEOUT_MS = 60_000;

function failure(raw: string): CliInvocationResult {
  return Object.freeze({
    ok: false as const,
    kind: "spawn-error" as const,
    raw,
  });
}

function isProfileOverride(value: unknown): value is RoadmapProposalProfileOverride {
  return (
    value === "auto" ||
    (typeof value === "string" &&
      (ROADMAP_PROPOSAL_PROFILES as readonly string[]).includes(value))
  );
}

function overrideArguments(profile: RoadmapProposalProfile): readonly string[] {
  const resolved = resolveRoadmapProposalProfile(profile);
  return [
    "--provider-model",
    resolved.model,
    ...(resolved.effort === null
      ? []
      : ["--provider-effort", resolved.effort]),
  ];
}

export function createRoadmapProposalHandler(options: {
  cliInvoker: CliInvoker;
  resolveRepositoryPath: () => string | null;
  keychainReader: ProviderKeychainReader;
}): (
  projectName: unknown,
  profileOverride: unknown,
) => Promise<CliInvocationResult> {
  return async (projectName, profileOverride) => {
    if (typeof projectName !== "string") {
      return failure("Project name must be a string.");
    }
    if (!isProfileOverride(profileOverride)) {
      return failure("Roadmap proposal profile must be auto, economy, balanced, or deep.");
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

    // The renderer selects only a closed profile enum. The Electron main process
    // resolves that profile to the canonical model/effort pair; arbitrary model
    // IDs and effort values never cross the renderer boundary.
    return options.cliInvoker.invoke(
      "roadmap",
      [
        "propose",
        projectName,
        "--provider",
        "anthropic_api",
        ...(profileOverride === "auto"
          ? []
          : overrideArguments(profileOverride)),
        "--provider-timeout-ms",
        String(DESKTOP_ROADMAP_PROPOSAL_TIMEOUT_MS),
      ],
      repositoryPath,
      { ANTHROPIC_API_KEY: credential.apiKey },
    );
  };
}
