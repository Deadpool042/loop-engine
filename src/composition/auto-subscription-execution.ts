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
 * AUTO deliberately exposes only standard subscription profiles.
 * Claude remains the deterministic primary at equal funding/tier/effort;
 * Codex stays available as the qualified secondary provider, but the AUTO
 * composition does not escalate to advanced/frontier profiles implicitly.
 * No API or additional-credit funding mode is present here.
 */
export function buildAutoSubscriptionProviderConfigurations(): readonly LoopProviderConfiguration[] {
  return Object.freeze([
    Object.freeze({
      id: "claude_code" as const,
      executable: "claude",
      timeoutMs: 240_000,
      maxTurns: 16,
      profiles: Object.freeze([
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
      ]),
    }),
    Object.freeze({
      id: "codex" as const,
      executable: "codex",
      timeoutMs: 240_000,
      profiles: Object.freeze([
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
      ]),
    }),
  ]);
}
