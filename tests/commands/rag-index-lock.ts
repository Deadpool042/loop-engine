import { mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `tests/commands/rag-index.test.ts` and `tests/commands/rag-search.test.ts`
 * both rebuild/read/corrupt the single shared `.loop-engine/rag-index.json`
 * artifact. Node's test runner executes test files in separate, concurrent
 * processes, so without cross-process coordination those two files can race
 * on the same file. This lock (a simple exclusive lock directory) serializes
 * every test body that touches the shared RAG index, across both files.
 */
const LOCK_DIR = join(process.cwd(), ".loop-engine-rag-test.lock");

/**
 * A lock directory older than this is treated as abandoned (e.g. left behind
 * by an interrupted test run) and is reclaimed instead of polled forever.
 * Well above the normal duration of any single test using this helper, but
 * short enough to bound the worst-case wait.
 */
const STALE_LOCK_THRESHOLD_MS = 30_000;
const POLL_INTERVAL_MS = 25;

export interface RagIndexLockOptions {
  /** Overrides the lock directory. Defaults to the shared real-run lock. */
  lockDir?: string;
  /** Overrides the staleness threshold. Defaults to {@link STALE_LOCK_THRESHOLD_MS}. */
  staleThresholdMs?: number;
  /** Overrides the poll interval. Defaults to {@link POLL_INTERVAL_MS}. */
  pollIntervalMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reclaimIfStale(lockDir: string, staleThresholdMs: number): void {
  let stat;
  try {
    stat = statSync(lockDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }

  if (Date.now() - stat.mtimeMs < staleThresholdMs) return;

  try {
    rmSync(lockDir, { recursive: true, force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function withRagIndexLock<T>(
  fn: () => T | Promise<T>,
  options: RagIndexLockOptions = {},
): Promise<T> {
  const lockDir = options.lockDir ?? LOCK_DIR;
  const staleThresholdMs = options.staleThresholdMs ?? STALE_LOCK_THRESHOLD_MS;
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;

  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      reclaimIfStale(lockDir, staleThresholdMs);
      await sleep(pollIntervalMs);
    }
  }

  try {
    return await fn();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}
