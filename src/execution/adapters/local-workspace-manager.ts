import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  createWorkspaceManager,
  type WorkspaceHandle,
  type WorkspaceManager,
} from "../workspace-manager.js";

function encodeSegment(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export type LocalWorkspaceManagerOptions = Readonly<{
  workspaceRoot: string;
}>;

export function createLocalWorkspaceManager(
  options: LocalWorkspaceManagerOptions,
): WorkspaceManager {
  return createWorkspaceManager(
    async ({ projectId, attemptId }) => {
      const workspaceId = `${encodeSegment(projectId)}.${encodeSegment(attemptId)}`;
      const path = join(options.workspaceRoot, workspaceId);

      await mkdir(path, { recursive: false });

      const handle: WorkspaceHandle = Object.freeze({
        workspaceId,
        projectId,
        attemptId,
        path,
      });

      return handle;
    },
    async (workspace) => {
      await rm(workspace.path, { recursive: true, force: true });
    },
  );
}
