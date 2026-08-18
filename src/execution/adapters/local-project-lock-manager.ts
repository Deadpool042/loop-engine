import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { hostname as getHostname } from "node:os";
import { join } from "node:path";

import {
  createProjectLockManager,
  type ProjectLockHandle,
  type ProjectLockManager,
} from "../project-lock-manager.js";

const LOCK_FORMAT_VERSION = 1;
const OWNER_FILE_NAME = "owner.json";
const MAX_RECOVERY_ATTEMPTS = 3;
const MAX_METADATA_STRING_LENGTH = 512;

type ProcessInspection = "alive" | "dead" | "unknown";

type LockOwnerMetadata = Readonly<{
  version: number;
  projectId: string;
  attemptId: string;
  lockId: string;
  pid: number;
  hostname: string;
  createdAt: string;
}>;

function encodeSegment(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isAlreadyPresent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "EEXIST" || error.code === "ENOTEMPTY")
  );
}

function defaultProcessInspection(pid: number): ProcessInspection {
  try {
    process.kill(pid, 0);
    return "alive";
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "ESRCH") {
        return "dead";
      }
      if (error.code === "EPERM") {
        return "unknown";
      }
    }

    return "unknown";
  }
}

function isBoundedString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_METADATA_STRING_LENGTH
  );
}

function parseLockOwnerMetadata(value: string): LockOwnerMetadata | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const record = parsed as Record<string, unknown>;
  if (
    record.version !== LOCK_FORMAT_VERSION ||
    !isBoundedString(record.projectId) ||
    !isBoundedString(record.attemptId) ||
    !isBoundedString(record.lockId) ||
    typeof record.pid !== "number" ||
    !Number.isSafeInteger(record.pid) ||
    record.pid <= 0 ||
    !isBoundedString(record.hostname) ||
    !isBoundedString(record.createdAt) ||
    Number.isNaN(Date.parse(record.createdAt))
  ) {
    return undefined;
  }

  return Object.freeze({
    version: LOCK_FORMAT_VERSION,
    projectId: record.projectId,
    attemptId: record.attemptId,
    lockId: record.lockId,
    pid: record.pid,
    hostname: record.hostname,
    createdAt: record.createdAt,
  });
}

export type LocalProjectLockManagerOptions = Readonly<{
  lockRoot: string;
  hostname?: string;
  ownerProcessId?: number;
  now?: () => Date;
  inspectProcess?: (pid: number) => ProcessInspection;
  beforeCanonicalPublish?: () => void | Promise<void>;
  onStaleOwnerObserved?: () => void | Promise<void>;
}>;

export function createLocalProjectLockManager(
  options: LocalProjectLockManagerOptions,
): ProjectLockManager {
  const pathsByLockId = new Map<string, string>();
  const hostname = options.hostname ?? getHostname();
  const ownerProcessId = options.ownerProcessId ?? process.pid;
  const now = options.now ?? (() => new Date());
  const inspectProcess = options.inspectProcess ?? defaultProcessInspection;

  async function pathExists(path: string): Promise<boolean> {
    try {
      await lstat(path);
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }

      throw error;
    }
  }

  async function readOwner(
    lockPath: string,
  ): Promise<LockOwnerMetadata | undefined> {
    try {
      return parseLockOwnerMetadata(
        await readFile(join(lockPath, OWNER_FILE_NAME), "utf8"),
      );
    } catch {
      return undefined;
    }
  }

  async function recoverDeadLock(
    lockPath: string,
    projectId: string,
  ): Promise<boolean> {
    const owner = await readOwner(lockPath);
    if (
      owner === undefined ||
      owner.projectId !== projectId ||
      owner.hostname !== hostname ||
      inspectProcess(owner.pid) !== "dead"
    ) {
      return false;
    }

    await options.onStaleOwnerObserved?.();

    const quarantinePath = `${lockPath}.recovered-${encodeSegment(owner.lockId)}`;
    if (await pathExists(quarantinePath)) {
      return false;
    }

    try {
      await rename(lockPath, quarantinePath);
      return true;
    } catch (error) {
      if (isAlreadyPresent(error)) {
        return false;
      }
      if (isNotFound(error)) {
        return true;
      }

      throw error;
    }
  }

  return createProjectLockManager(
    async ({ projectId, attemptId }) => {
      await mkdir(options.lockRoot, { recursive: true });
      const lockPath = join(options.lockRoot, encodeSegment(projectId));
      const lockId = randomUUID();
      const candidatePath = join(options.lockRoot, `.candidate-${lockId}`);
      const metadata: LockOwnerMetadata = Object.freeze({
        version: LOCK_FORMAT_VERSION,
        projectId,
        attemptId,
        lockId,
        pid: ownerProcessId,
        hostname,
        createdAt: now().toISOString(),
      });

      await mkdir(candidatePath);
      try {
        await writeFile(
          join(candidatePath, OWNER_FILE_NAME),
          JSON.stringify(metadata),
          { encoding: "utf8", flag: "wx" },
        );
        await options.beforeCanonicalPublish?.();

        for (
          let recoveryAttempt = 0;
          recoveryAttempt <= MAX_RECOVERY_ATTEMPTS;
          recoveryAttempt += 1
        ) {
          if (!(await pathExists(lockPath))) {
            try {
              await rename(candidatePath, lockPath);
              const handle: ProjectLockHandle = Object.freeze({
                lockId,
                projectId,
                attemptId,
              });
              pathsByLockId.set(handle.lockId, lockPath);
              return Object.freeze({ acquired: true as const, handle });
            } catch (error) {
              if (!isAlreadyPresent(error)) {
                throw error;
              }
            }
          }

          if (recoveryAttempt === MAX_RECOVERY_ATTEMPTS) {
            return Object.freeze({
              acquired: false as const,
              reason: "project_locked" as const,
            });
          }

          if (!(await recoverDeadLock(lockPath, projectId))) {
            return Object.freeze({
              acquired: false as const,
              reason: "project_locked" as const,
            });
          }
        }

        return Object.freeze({
          acquired: false as const,
          reason: "project_locked" as const,
        });
      } finally {
        await rm(candidatePath, { recursive: true, force: true });
      }
    },
    async (handle) => {
      const lockPath = pathsByLockId.get(handle.lockId);
      if (lockPath === undefined) {
        return;
      }

      const owner = await readOwner(lockPath);
      if (
        owner === undefined ||
        owner.projectId !== handle.projectId ||
        owner.attemptId !== handle.attemptId ||
        owner.lockId !== handle.lockId
      ) {
        pathsByLockId.delete(handle.lockId);
        return;
      }

      await rm(lockPath, { recursive: true, force: true });
      pathsByLockId.delete(handle.lockId);
    },
  );
}
