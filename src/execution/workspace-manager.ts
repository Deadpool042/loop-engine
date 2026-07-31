export type WorkspaceAllocationRequest = Readonly<{
  projectId: string;
  attemptId: string;
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
