import type { LoopProviderConfiguration } from "./provider-registry.js";

const BASE_CAPABILITIES = [
  "code_edit",
  "shell_exec",
  "test_execution",
] as const;

const INCLUDED_QUOTA_UNKNOWN = Object.freeze({
  state: "unknown" as const,
  source: "unavailable" as const,
});

/**
 * Fixed, subscription-only autonomous portfolio.
 *
 * Codex is intentionally excluded from AUTO until its read boundary is
 * qualified for autonomous use (V49). No API or additional-credit funding
 * mode is present here.
 */
export function buildAutoSubscriptionProviderConfigurations(): readonly LoopProviderConfiguration[] {
  return Object.freeze([
    Object.freeze({
      id: "claude_code" as const,
      executable: "claude",
      timeoutMs: 300_000,
      profiles: Object.freeze([
        Object.freeze({
          id: "economy",
          model: "claude-haiku-4-5",
          economicTier: "economy" as const,
          fundingMode: "included_subscription" as const,
          quota: INCLUDED_QUOTA_UNKNOWN,
          capabilities: BASE_CAPABILITIES,
        }),
        Object.freeze({
          id: "standard",
          model: "claude-sonnet-5",
          economicTier: "standard" as const,
          fundingMode: "included_subscription" as const,
          quota: INCLUDED_QUOTA_UNKNOWN,
          capabilities: Object.freeze([
            ...BASE_CAPABILITIES,
            "long_context" as const,
          ]),
        }),
        Object.freeze({
          id: "advanced",
          model: "claude-opus-5",
          economicTier: "advanced" as const,
          fundingMode: "included_subscription" as const,
          quota: INCLUDED_QUOTA_UNKNOWN,
          capabilities: Object.freeze([
            ...BASE_CAPABILITIES,
            "long_context" as const,
            "multi_file_refactor" as const,
          ]),
        }),
      ]),
    }),
  ]);
}
