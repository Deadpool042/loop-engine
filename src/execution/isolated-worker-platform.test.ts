import assert from "node:assert/strict";
import test from "node:test";
import {
  createIsolatedWorkerPlatform,
  createProjectLockManager,
  createWorkspaceManager,
  type ProjectLockHandle,
  type WorkspaceHandle,
} from "./index.js";

test("rejects execution when the project lock is already held", async () => {
  let allocated = false;

  const platform = createIsolatedWorkerPlatform(
    createProjectLockManager(
      async () => ({ acquired: false, reason: "project_locked" }),
      async () => undefined,
    ),
    createWorkspaceManager(
      async () => {
        allocated = true;
        throw new Error("workspace must not be allocated");
      },
      async () => undefined,
    ),
  );

  const result = await platform.execute(
    { projectId: "project-a", attemptId: "attempt-2" },
    async () => "unreachable",
  );

  assert.deepEqual(result, {
    status: "rejected",
    reason: "project_locked",
  });
  assert.equal(allocated, false);
});

test("releases workspace then project lock after successful execution", async () => {
  const events: string[] = [];
  const lock: ProjectLockHandle = {
    lockId: "lock-1",
    projectId: "project-a",
    attemptId: "attempt-1",
  };
  const workspace: WorkspaceHandle = {
    workspaceId: "workspace-1",
    projectId: "project-a",
    attemptId: "attempt-1",
    path: "/tmp/workspace-1",
  };

  const platform = createIsolatedWorkerPlatform(
    createProjectLockManager(
      async () => {
        events.push("lock-acquired");
        return { acquired: true, handle: lock };
      },
      async () => {
        events.push("lock-released");
      },
    ),
    createWorkspaceManager(
      async () => {
        events.push("workspace-allocated");
        return workspace;
      },
      async () => {
        events.push("workspace-released");
      },
    ),
  );

  const result = await platform.execute(
    { projectId: "project-a", attemptId: "attempt-1" },
    async (handle) => {
      events.push("operation");
      assert.equal(handle, workspace);
      return "done";
    },
  );

  assert.deepEqual(result, { status: "completed", result: "done" });
  assert.deepEqual(events, [
    "lock-acquired",
    "workspace-allocated",
    "operation",
    "workspace-released",
    "lock-released",
  ]);
});

test("releases workspace and project lock when execution fails", async () => {
  const events: string[] = [];
  const failure = new Error("provider failed");

  const platform = createIsolatedWorkerPlatform(
    createProjectLockManager(
      async () => ({
        acquired: true,
        handle: {
          lockId: "lock-1",
          projectId: "project-a",
          attemptId: "attempt-1",
        },
      }),
      async () => {
        events.push("lock-released");
      },
    ),
    createWorkspaceManager(
      async () => ({
        workspaceId: "workspace-1",
        projectId: "project-a",
        attemptId: "attempt-1",
        path: "/tmp/workspace-1",
      }),
      async () => {
        events.push("workspace-released");
      },
    ),
  );

  await assert.rejects(
    platform.execute(
      { projectId: "project-a", attemptId: "attempt-1" },
      async () => {
        throw failure;
      },
    ),
    failure,
  );

  assert.deepEqual(events, ["workspace-released", "lock-released"]);
});

test("preserves the operation failure when workspace cleanup also fails", async () => {
  const events: string[] = [];
  const operationFailure = new Error("provider failed");

  const platform = createIsolatedWorkerPlatform(
    createProjectLockManager(
      async () => ({
        acquired: true,
        handle: {
          lockId: "lock-1",
          projectId: "project-a",
          attemptId: "attempt-1",
        },
      }),
      async () => {
        events.push("lock-released");
      },
    ),
    createWorkspaceManager(
      async () => ({
        workspaceId: "workspace-1",
        projectId: "project-a",
        attemptId: "attempt-1",
        path: "/tmp/workspace-1",
      }),
      async () => {
        events.push("workspace-release-attempted");
        throw new Error("workspace cleanup failed");
      },
    ),
  );

  await assert.rejects(
    platform.execute(
      { projectId: "project-a", attemptId: "attempt-1" },
      async () => {
        throw operationFailure;
      },
    ),
    operationFailure,
  );

  assert.deepEqual(events, ["workspace-release-attempted", "lock-released"]);
});
