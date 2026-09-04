import type { AgentEffort } from "../agents/types.js";

export const LOOP_RUNTIME_DELEGATION_MODES = [
  "direct_preferred",
  "runtime_managed_allowed",
] as const;

export type LoopRuntimeDelegationMode =
  (typeof LOOP_RUNTIME_DELEGATION_MODES)[number];

export type LoopRuntimeDelegationPolicy = Readonly<{
  mode: LoopRuntimeDelegationMode;
  reason: "low_effort" | "higher_effort";
}>;

/**
 * Derives one deterministic top-level delegation contract from the already
 * admitted invocation effort. This never starts another executor, provider or
 * scheduler; it only tells the selected runtime whether internal delegation is
 * worth considering.
 */
export function resolveLoopRuntimeDelegationPolicy(
  effort: AgentEffort,
): LoopRuntimeDelegationPolicy {
  return Object.freeze(
    effort === "low"
      ? { mode: "direct_preferred" as const, reason: "low_effort" as const }
      : {
          mode: "runtime_managed_allowed" as const,
          reason: "higher_effort" as const,
        },
  );
}

/**
 * Shared prompt guidance for runtimes that already support skills/sub-agents.
 * The policy remains advisory inside the runtime; Loop Engine's mechanical
 * authority is still the final worktree delta, scope guard and validation.
 */
export function buildLoopRuntimeDelegationGuidance(
  policy: LoopRuntimeDelegationPolicy,
): readonly string[] {
  const common = [
    "Any runtime-native skill or sub-agent remains bound by the same objective, deliverables, out-of-scope rules, writable file scope, policy permissions, and no-publication boundary.",
    "Do not add or switch to another external provider, paid API, credential, or runtime.",
    "You remain responsible for one final worktree delta. Delegated work is not authoritative validation; Loop Engine validates the final delta after you return.",
  ];

  return Object.freeze(
    policy.mode === "direct_preferred"
      ? [
          "Prefer direct execution for this low-effort task. Avoid sub-agents unless they are strictly necessary to use an already-available runtime capability.",
          ...common,
        ]
      : [
          "You may use runtime-native skills or sub-agents when independent work streams or an independent review would materially improve speed or safety. Keep delegation minimal and shallow; do not delegate simple sequential work.",
          ...common,
        ],
  );
}
