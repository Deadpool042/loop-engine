import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import type { LoopRunResult, LoopRunStatus } from "../loop/types.js";

/**
 * Run History / Execution Evidence Store.
 *
 * Persists the TERMINAL result of an existing LoopRunner cycle (plan,
 * execute, commit) as an append-only, project-scoped JSONL journal under
 * `.loop-engine/runs/<project>.jsonl`. This is strictly an observability
 * layer: it records facts the runner already computed (see
 * `src/loop/types.ts` for `LoopRunResult`) and never derives, infers, or
 * decides anything from them -- no stagnation detector, no circuit breaker,
 * no cumulative budget enforcement. It is not Project Memory and not the
 * local RAG layer (`docs/architecture/memory-layer.md`); those remain
 * separate, untouched responsibilities.
 *
 * Each journal line is the `LoopRunResult` itself, verbatim: it already
 * carries every field a persistence envelope would need (`schemaVersion`,
 * `project`, `completedAt`), so no additional wrapper is introduced -- one
 * would only duplicate the existing business model.
 *
 * The journal is append-only with no physical retention/eviction in this
 * lot; only the read path (`generateRunHistoryReport` in `reports.ts`) is
 * bounded. A retention policy is deliberately deferred until real volume is
 * observed.
 */

export const RUN_HISTORY_DIRECTORY = ".loop-engine/runs";
/** Smallest reasonable default page: fits one terminal screen without pagination. */
export const DEFAULT_RUN_HISTORY_LIMIT = 20;
/** Hard cap bounding the read-side buffer regardless of a caller-supplied limit. */
export const MAX_RUN_HISTORY_LIMIT = 100;

const TERMINAL_LOOP_RUN_STATUSES: ReadonlySet<LoopRunStatus> = new Set([
  "completed",
  "blocked",
  "failed",
  "cancelled",
]);

/**
 * Project names are the canonical `name` keys declared in `projects.yaml`
 * (see `findProject` in `./project.ts`) -- lowercase kebab-case in practice.
 * This pattern is a defense-in-depth guard against path traversal / scope
 * escape, not the source of project identity itself.
 */
const PROJECT_IDENTITY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export class InvalidRunHistoryProjectIdentityError extends Error {}

/** Resolves the project-scoped journal path, rejecting any identity that could escape `.loop-engine/runs/`. */
export function resolveRunHistoryFilePath(projectName: string): string {
  if (!PROJECT_IDENTITY_PATTERN.test(projectName)) {
    throw new InvalidRunHistoryProjectIdentityError(
      `Invalid run history project identity: ${projectName}`,
    );
  }
  return join(RUN_HISTORY_DIRECTORY, `${projectName}.jsonl`);
}

export function isTerminalLoopRunResult(result: LoopRunResult): boolean {
  return TERMINAL_LOOP_RUN_STATUSES.has(result.status);
}

export type LoopRunHistoryWriteOutcome = Readonly<{
  /** True once a line was actually appended; false for a skip or a failure. */
  written: boolean;
  ok: boolean;
  code?: "invalid_project_identity" | "write_failed";
  message?: string;
}>;

/**
 * Appends the terminal result of one LoopRunner cycle to its project-scoped
 * journal. A no-op (not a failure) for a non-terminal result: intermediate
 * states, cancellation requests, or a started-but-unfinished run are never
 * persisted as a final entry. A run is written at most once per call,
 * matching the runner contract where `runLoopPlan`, `runLoopExecute`, and
 * `runLoopCommit` each resolve exactly one terminal `LoopRunResult`.
 *
 * On write failure, the outcome is reported (`ok: false`) but the caller's
 * governed `LoopRunResult` is never mutated: this journal observes, it does
 * not gate a successful run's outcome. The caller is responsible for
 * surfacing a failed outcome through an existing non-silent channel.
 */
export function recordLoopRunHistory(
  result: LoopRunResult,
): LoopRunHistoryWriteOutcome {
  if (!isTerminalLoopRunResult(result)) {
    return Object.freeze({ written: false, ok: true });
  }
  try {
    const filePath = resolveRunHistoryFilePath(result.project);
    mkdirSync(RUN_HISTORY_DIRECTORY, { recursive: true });
    appendFileSync(filePath, `${JSON.stringify(result)}\n`, "utf8");
    return Object.freeze({ written: true, ok: true });
  } catch (error) {
    if (error instanceof InvalidRunHistoryProjectIdentityError) {
      return Object.freeze({
        written: false,
        ok: false,
        code: "invalid_project_identity" as const,
        message: error.message,
      });
    }
    return Object.freeze({
      written: false,
      ok: false,
      code: "write_failed" as const,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
