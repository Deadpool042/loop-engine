export type ProjectLockRequest = Readonly<{
  projectId: string;
  attemptId: string;
}>;

export type ProjectLockHandle = Readonly<{
  lockId: string;
  projectId: string;
  attemptId: string;
}>;

export type ProjectLockAcquisition =
  | Readonly<{
      acquired: true;
      handle: ProjectLockHandle;
    }>
  | Readonly<{
      acquired: false;
      reason: "project_locked";
    }>;

export interface ProjectLockManager {
  acquire(request: ProjectLockRequest): Promise<ProjectLockAcquisition>;
  release(handle: ProjectLockHandle): Promise<void>;
}

export function createProjectLockManager(
  acquire: ProjectLockManager["acquire"],
  release: ProjectLockManager["release"],
): ProjectLockManager {
  return Object.freeze({
    acquire,
    release,
  });
}
