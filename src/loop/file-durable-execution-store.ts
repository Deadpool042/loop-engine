import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import { join, resolve } from "node:path";

import { createLocalProjectLockManager } from "../execution/adapters/local-project-lock-manager.js";
import type { ProjectLockManager } from "../execution/project-lock-manager.js";

import type {
  DurableExecutionRecord,
  DurableExecutionStore,
} from "./durable-execution.js";
import {
  createDurableExecutionEnvelope,
  parseDurableExecutionEnvelope,
} from "./durable-execution-envelope.js";

export type DurableExecutionRecordSummary = Readonly<{
  idempotencyKey: string;
  project: string;
  status: DurableExecutionRecord["status"];
  revision: number;
  attempt: number;
  updatedAt: string;
}>;

export type DurableExecutionRepository = DurableExecutionStore &
  Readonly<{
    list(project?: string): Promise<readonly DurableExecutionRecordSummary[]>;
    verify(idempotencyKey: string): Promise<boolean>;
  }>;

export type FileDurableExecutionStoreOptions = Readonly<{
  directory: string;
  lockTimeoutMs?: number;
  lockRetryMs?: number;
  nowMs?: () => number;
  /**
   * Cross-process mutual exclusion per record key. Defaults to the local
   * directory lock manager (owner metadata, dead-owner quarantine by lock id).
   * A live owner is never dispossessed: contention ends in a bounded refusal.
   */
  lockManager?: ProjectLockManager;
}>;

/**
 * Reads verified durable execution records without creating directories,
 * locks or files. Intended for read-only status/reporting surfaces.
 */
export async function readFileDurableExecutionRecords(
  directoryInput: string,
  project?: string,
): Promise<readonly DurableExecutionRecord[]> {
  const directory = resolve(directoryInput);
  let names: string[];
  try {
    names = (await readdir(directory))
      .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return Object.freeze([]);
    }
    throw error;
  }

  const records: DurableExecutionRecord[] = [];
  for (const name of names) {
    const record = await readRecord(join(directory, name));
    if (record === null || (project !== undefined && record.project !== project)) {
      continue;
    }
    records.push(record);
  }

  return Object.freeze(
    records.sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        left.idempotencyKey.localeCompare(right.idempotencyKey),
    ),
  );
}

const LOCK_DIRECTORY = ".locks";

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer.`);
  }
  return value;
}

function keyDigest(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function recordPath(directory: string, key: string): string {
  return join(directory, `${keyDigest(key)}.json`);
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, durationMs));
}

/**
 * Writes through a file handle, flushes the file, publishes it atomically and
 * flushes the parent directory so that the rename itself survives a crash.
 * Synchronization is fsync(2): it does not prove survival of a power loss on
 * every storage stack (macOS fsync does not issue F_FULLFSYNC).
 */
async function writeRecordDurably(
  directory: string,
  path: string,
  serialized: string,
): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  const directoryHandle = await open(directory, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}

async function readRecord(path: string): Promise<DurableExecutionRecord | null> {
  let serialized: string;
  try {
    serialized = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const decoded = parseDurableExecutionEnvelope(serialized);
  if (decoded.status === "rejected") {
    throw new Error(`Durable execution storage integrity failure: ${decoded.code}`);
  }
  return decoded.envelope.record;
}

/**
 * Creates a process-safe filesystem repository with per-key exclusive locks,
 * compare-and-swap revisions, atomic rename writes and integrity verification
 * on every read. One record is stored per SHA-256 key digest.
 */
export function createFileDurableExecutionStore(
  options: FileDurableExecutionStoreOptions,
): DurableExecutionRepository {
  if (typeof options.directory !== "string" || options.directory.trim().length === 0) {
    throw new TypeError("Durable execution directory must be non-empty.");
  }
  const directory = resolve(options.directory);
  const lockTimeoutMs = positiveInteger(
    options.lockTimeoutMs ?? 10_000,
    "lockTimeoutMs",
  );
  const lockRetryMs = positiveInteger(options.lockRetryMs ?? 25, "lockRetryMs");
  const nowMs = options.nowMs ?? Date.now;
  const lockRoot = join(directory, LOCK_DIRECTORY);
  const lockManager =
    options.lockManager ?? createLocalProjectLockManager({ lockRoot });

  async function ready(): Promise<void> {
    // Explicit mode: the state directory must not depend on the caller's umask.
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await mkdir(lockRoot, { recursive: true, mode: 0o700 });
  }

  async function withKeyLock<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const startedAt = nowMs();
    for (;;) {
      const acquisition = await lockManager.acquire({
        projectId: keyDigest(key),
        attemptId: randomUUID(),
      });
      if (acquisition.acquired) {
        try {
          return await operation();
        } finally {
          await lockManager.release(acquisition.handle);
        }
      }
      if (nowMs() - startedAt >= lockTimeoutMs) {
        throw new Error("Durable execution storage lock timed out.");
      }
      await sleep(lockRetryMs);
    }
  }

  return Object.freeze({
    async load(idempotencyKey) {
      await ready();
      return readRecord(recordPath(directory, idempotencyKey));
    },

    async save(record, expectedRevision) {
      await ready();
      return withKeyLock(record.idempotencyKey, async () => {
        const path = recordPath(directory, record.idempotencyKey);
        const existing = await readRecord(path);
        const observedRevision = existing?.revision ?? null;
        if (observedRevision !== expectedRevision) return false;
        if (
          existing !== null &&
          existing.idempotencyKey !== record.idempotencyKey
        ) {
          throw new Error("Durable execution key digest collision detected.");
        }

        const envelope = createDurableExecutionEnvelope(record);
        await writeRecordDurably(directory, path, `${JSON.stringify(envelope)}\n`);
        return true;
      });
    },

    async list(project) {
      await ready();
      const names = (await readdir(directory))
        .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
        .sort();
      const summaries: DurableExecutionRecordSummary[] = [];
      for (const name of names) {
        const record = await readRecord(join(directory, name));
        if (record === null || (project !== undefined && record.project !== project)) {
          continue;
        }
        summaries.push(
          Object.freeze({
            idempotencyKey: record.idempotencyKey,
            project: record.project,
            status: record.status,
            revision: record.revision,
            attempt: record.attempt,
            updatedAt: record.updatedAt,
          }),
        );
      }
      return Object.freeze(
        summaries.sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) ||
            left.idempotencyKey.localeCompare(right.idempotencyKey),
        ),
      );
    },

    async verify(idempotencyKey) {
      await ready();
      try {
        return (await readRecord(recordPath(directory, idempotencyKey))) !== null;
      } catch {
        return false;
      }
    },
  });
}
