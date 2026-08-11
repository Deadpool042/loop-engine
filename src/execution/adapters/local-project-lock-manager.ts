import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  createProjectLockManager,
  type ProjectLockHandle,
  type ProjectLockManager,
} from "../project-lock-manager.js";

function encodeSegment(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export type LocalProjectLockManagerOptions = Readonly<{
  lockRoot: string;
}>;

export function createLocalProjectLockManager(
  options: LocalProjectLockManagerOptions,
): ProjectLockManager {
  const pathsByLockId = new Map<string, string>();

  return createProjectLockManager(
    async ({ projectId, attemptId }) => {
      await mkdir(options.lockRoot, { recursive: true });
      const lockPath = join(options.lockRoot, encodeSegment(projectId));

      try {
        await mkdir(lockPath, { recursive: false });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "EEXIST"
        ) {
          return Object.freeze({
            acquired: false as const,
            reason: "project_locked" as const,
          });
        }

        throw error;
      }

      const handle: ProjectLockHandle = Object.freeze({
        lockId: `${encodeSegment(projectId)}.${encodeSegment(attemptId)}`,
        projectId,
        attemptId,
      });

      pathsByLockId.set(handle.lockId, lockPath);

      return Object.freeze({
        acquired: true as const,
        handle,
      });
    },
    async (handle) => {
      const lockPath = pathsByLockId.get(handle.lockId);
      if (lockPath === undefined) {
        return;
      }

      await rm(lockPath, { recursive: true, force: true });
      pathsByLockId.delete(handle.lockId);
    },
  );
}
