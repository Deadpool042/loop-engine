import { mkdirSync, rmSync } from "node:fs";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRagIndexLock<T>(
  fn: () => T | Promise<T>,
): Promise<T> {
  for (;;) {
    try {
      mkdirSync(LOCK_DIR);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await sleep(25);
    }
  }

  try {
    return await fn();
  } finally {
    rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}
