export type WorkspaceAllocationRequest = Readonly<{
  projectId: string;
  attemptId: string;
  /**
   * Repository-relative paths that may be locally dirty without invalidating
   * an isolated HEAD-based workspace. Intended for narrow control artifacts
   * such as the project-owned execution decision.
   */
  allowedSourceDirtyPaths?: readonly string[];
}>;

export type WorkspaceHandle = Readonly<{
  workspaceId: string;
  projectId: string;
  attemptId: string;
  path: string;
}>;

export interface WorkspaceManager {
  allocate(request: WorkspaceAllocationRequest): Promise<WorkspaceHandle>;
  release(workspace: WorkspaceHandle): Promise<void>;
}

export function createWorkspaceManager(
  allocate: WorkspaceManager["allocate"],
  release: WorkspaceManager["release"],
): WorkspaceManager {
  return Object.freeze({
    allocate,
    release,
  });
}
