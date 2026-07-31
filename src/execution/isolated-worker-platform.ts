import type {
  ProjectLockManager,
  ProjectLockRequest,
} from "./project-lock-manager.js";
import type {
  WorkspaceAllocationRequest,
  WorkspaceHandle,
  WorkspaceManager,
} from "./workspace-manager.js";

export type IsolatedWorkerExecutionRequest = ProjectLockRequest &
  WorkspaceAllocationRequest;

export type IsolatedWorkerExecutionFailure = Readonly<{
  status: "rejected";
  reason: "project_locked";
}>;

export type IsolatedWorkerExecutionSuccess<Result> = Readonly<{
  status: "completed";
  result: Result;
}>;

export type IsolatedWorkerExecutionResult<Result> =
  | IsolatedWorkerExecutionFailure
  | IsolatedWorkerExecutionSuccess<Result>;

export type IsolatedWorkerOperation<Result> = (
  workspace: WorkspaceHandle,
) => Promise<Result>;

export interface IsolatedWorkerPlatform {
  execute<Result>(
    request: IsolatedWorkerExecutionRequest,
    operation: IsolatedWorkerOperation<Result>,
  ): Promise<IsolatedWorkerExecutionResult<Result>>;
}

export function createIsolatedWorkerPlatform(
  projectLocks: ProjectLockManager,
  workspaces: WorkspaceManager,
): IsolatedWorkerPlatform {
  return Object.freeze({
    async execute<Result>(
      request: IsolatedWorkerExecutionRequest,
      operation: IsolatedWorkerOperation<Result>,
    ): Promise<IsolatedWorkerExecutionResult<Result>> {
      const acquisition = await projectLocks.acquire(request);

      if (!acquisition.acquired) {
        return Object.freeze({
          status: "rejected",
          reason: acquisition.reason,
        });
      }

      try {
        const workspace = await workspaces.allocate(request);

        try {
          const result = await operation(workspace);

          return Object.freeze({
            status: "completed",
            result,
          });
        } finally {
          await workspaces.release(workspace);
        }
      } finally {
        await projectLocks.release(acquisition.handle);
      }
    },
  });
}
