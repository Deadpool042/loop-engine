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
 * Claude remains the deterministic primary at equal funding/tier/effort.
 * Codex is a qualified secondary provider: its AUTO executor uses a strict
 * worktree-only permission profile and subscription authentication only.
 * No API or additional-credit funding mode is present here.
 */
export function buildAutoSubscriptionProviderConfigurations(): readonly LoopProviderConfiguration[] {
  return Object.freeze([
    Object.freeze({
      id: "claude_code" as const,
      executable: "claude",
      timeoutMs: 420_000,
      maxTurns: 32,
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
    Object.freeze({
      id: "codex" as const,
      executable: "codex",
      timeoutMs: 420_000,
      profiles: Object.freeze([
        Object.freeze({
          id: "economy",
          model: "gpt-5.6-luna",
          economicTier: "economy" as const,
          fundingMode: "included_subscription" as const,
          quota: INCLUDED_QUOTA_UNKNOWN,
          capabilities: BASE_CAPABILITIES,
        }),
        Object.freeze({
          id: "standard",
          model: "gpt-5.6-sol",
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
          model: "gpt-5.6-terra",
          economicTier: "advanced" as const,
          fundingMode: "included_subscription" as const,
          quota: INCLUDED_QUOTA_UNKNOWN,
          capabilities: Object.freeze([
            ...BASE_CAPABILITIES,
            "long_context" as const,
            "multi_file_refactor" as const,
          ]),
        }),
        Object.freeze({
          id: "frontier",
          model: "gpt-6-astra",
          economicTier: "frontier" as const,
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
