import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

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
}>;

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

function lockPath(directory: string, key: string): string {
  return join(directory, `${keyDigest(key)}.lock`);
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, durationMs));
}

async function acquireLock(
  path: string,
  timeoutMs: number,
  retryMs: number,
  nowMs: () => number,
): Promise<() => Promise<void>> {
  const startedAt = nowMs();
  while (true) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(`${process.pid}\n`, "utf8");
      await handle.close();
      return async () => {
        await rm(path, { force: true });
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      try {
        const lockStat = await stat(path);
        if (nowMs() - lockStat.mtimeMs > timeoutMs) {
          await rm(path, { force: true });
          continue;
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw statError;
      }
      if (nowMs() - startedAt >= timeoutMs) {
        throw new Error("Durable execution storage lock timed out.");
      }
      await sleep(retryMs);
    }
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

  async function ready(): Promise<void> {
    await mkdir(directory, { recursive: true });
  }

  return Object.freeze({
    async load(idempotencyKey) {
      await ready();
      return readRecord(recordPath(directory, idempotencyKey));
    },

    async save(record, expectedRevision) {
      await ready();
      const release = await acquireLock(
        lockPath(directory, record.idempotencyKey),
        lockTimeoutMs,
        lockRetryMs,
        nowMs,
      );
      try {
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

        const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
        const envelope = createDurableExecutionEnvelope(record);
        await writeFile(temporaryPath, `${JSON.stringify(envelope)}\n`, {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
        });
        await rename(temporaryPath, path);
        return true;
      } finally {
        await release();
      }
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
