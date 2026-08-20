import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";
import type { ProviderKeychainReader } from "../keychain-reader.js";
import { ROADMAP_PROPOSAL_PROFILES, resolveRoadmapProposalProfile, type RoadmapProposalProfile } from "../../intelligence/roadmap-proposal-routing.js";
import type { RoadmapProposalProfileOverride } from "./roadmap-proposal-contract.js";
export const DESKTOP_GATE_REASSESSMENT_TIMEOUT_MS = 60_000;
const failure = (raw: string): CliInvocationResult => ({ ok: false, kind: "spawn-error", raw });
function profile(value: unknown): value is RoadmapProposalProfileOverride { return value === "auto" || (typeof value === "string" && (ROADMAP_PROPOSAL_PROFILES as readonly string[]).includes(value)); }
function args(value: RoadmapProposalProfile): readonly string[] { const resolved = resolveRoadmapProposalProfile(value); return ["--provider-model", resolved.model, ...(resolved.effort === null ? [] : ["--provider-effort", resolved.effort])]; }
export function createGateReassessmentHandler(options: { cliInvoker: CliInvoker; resolveRepositoryPath: () => string | null; keychainReader: ProviderKeychainReader }): (projectName: unknown, profileOverride: unknown) => Promise<CliInvocationResult> {
  return async (projectName, profileOverride) => {
    if (typeof projectName !== "string" || !profile(profileOverride)) return failure("Gate reassessment request is invalid.");
    const cwd = options.resolveRepositoryPath(); if (cwd === null) return failure("Loop Engine repository could not be resolved.");
    const credential = await options.keychainReader.read(); if (!credential.ok) return failure("Identifiant Anthropic indisponible dans le trousseau macOS.");
    return options.cliInvoker.invoke("roadmap", ["reassess-gates", projectName, "--provider", "anthropic_api", ...(profileOverride === "auto" ? [] : args(profileOverride)), "--provider-timeout-ms", String(DESKTOP_GATE_REASSESSMENT_TIMEOUT_MS)], cwd, { ANTHROPIC_API_KEY: credential.apiKey });
  };
}
