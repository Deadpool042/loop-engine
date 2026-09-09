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
 * AUTO exposes only qualified subscription profiles. Primary selection is
 * resolved by policy/task preference, capability, funding, quota and effort;
 * declaration order is not an execution preference. The other compatible
 * provider remains available for bounded failover. No API or
 * additional-credit funding mode is present here.
 */
export function buildAutoSubscriptionProviderConfigurations(): readonly LoopProviderConfiguration[] {
  return Object.freeze([
    Object.freeze({
      id: "claude_code" as const,
      executable: "claude",
      timeoutMs: 360_000,
      maxTurns: 24,
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
      timeoutMs: 360_000,
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
