import type {
  TextOnlyProvider,
  TextOnlyProviderInput,
  TextOnlyProviderResult,
} from "./types.js";

/**
 * Inert provider used when the caller has not explicitly configured an AI
 * provider. It performs no environment reads, process spawn, network access,
 * credential lookup, or fallback selection.
 */
export const unconfiguredTextOnlyProvider: TextOnlyProvider = Object.freeze({
  invoke: async (
    input: TextOnlyProviderInput,
  ): Promise<TextOnlyProviderResult> => ({
    status: "failed",
    provider: "unconfigured",
    model: input.model,
    code: "provider_unavailable",
    message: "No text-only provider is configured.",
    durationMs: 0,
    truncated: false,
  }),
});
