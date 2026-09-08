import type { LoopExecutionPlan } from "./execution-plan.js";
import { findOutOfScopeFiles } from "./file-scope.js";

export type ProviderWorktreeAdmission =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      code:
        | "worktree_not_clean"
        | "repair_scope_unavailable"
        | "worktree_scope_violation";
      message: string;
    }>;

/**
 * Initial provider execution remains strict: the worktree must be clean.
 * A dirty worktree is accepted only for an explicit bounded repair pass, and
 * only when every pre-existing modification remains inside the already
 * admitted writable-file scope.
 */
export function admitProviderWorktree(
  plan: LoopExecutionPlan,
  modifiedFiles: readonly string[],
): ProviderWorktreeAdmission {
  if (modifiedFiles.length === 0) {
    return Object.freeze({ ok: true as const });
  }

  if (plan.worktreeMode !== "repair_existing") {
    return Object.freeze({
      ok: false as const,
      code: "worktree_not_clean" as const,
      message: "Provider execution requires a clean worktree.",
    });
  }

  if (!Array.isArray(plan.allowedPaths) || plan.allowedPaths.length === 0) {
    return Object.freeze({
      ok: false as const,
      code: "repair_scope_unavailable" as const,
      message:
        "Bounded repair requires an explicit writable file scope for the existing worktree delta.",
    });
  }

  const outOfScope = findOutOfScopeFiles(modifiedFiles, plan.allowedPaths);
  if (outOfScope.length > 0) {
    return Object.freeze({
      ok: false as const,
      code: "worktree_scope_violation" as const,
      message:
        "Bounded repair refused existing worktree changes outside the admitted writable file scope.",
    });
  }

  return Object.freeze({ ok: true as const });
}
