import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLocalProjectLockManager } from "./local-project-lock-manager.js";
import { createLocalWorkspaceManager } from "./local-workspace-manager.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("le verrou local refuse deux tentatives concurrentes sur le même projet", async () => {
  const root = await mkdtemp(join(tmpdir(), "loop-lock-"));
  const lockRoot = join(root, "locks");
  await mkdir(lockRoot);

  try {
    const manager = createLocalProjectLockManager({ lockRoot });
    const first = await manager.acquire({ projectId: "project-a", attemptId: "a-1" });
    const second = await manager.acquire({ projectId: "project-a", attemptId: "a-2" });

    assert.equal(first.acquired, true);
    assert.deepEqual(second, {
      acquired: false,
      reason: "project_locked",
    });

    if (first.acquired) {
      await manager.release(first.handle);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("le verrou local autorise deux projets différents et permet la réacquisition", async () => {
  const root = await mkdtemp(join(tmpdir(), "loop-lock-"));
  const lockRoot = join(root, "locks");
  await mkdir(lockRoot);

  try {
    const manager = createLocalProjectLockManager({ lockRoot });
    const [first, other] = await Promise.all([
      manager.acquire({ projectId: "project-a", attemptId: "a-1" }),
      manager.acquire({ projectId: "project-b", attemptId: "b-1" }),
    ]);

    assert.equal(first.acquired, true);
    assert.equal(other.acquired, true);

    if (first.acquired) {
      await manager.release(first.handle);
    }
    if (other.acquired) {
      await manager.release(other.handle);
    }

    const reacquired = await manager.acquire({
      projectId: "project-a",
      attemptId: "a-2",
    });
    assert.equal(reacquired.acquired, true);
    if (reacquired.acquired) {
      await manager.release(reacquired.handle);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("le gestionnaire local crée des workspaces isolés puis les supprime", async () => {
  const root = await mkdtemp(join(tmpdir(), "loop-workspace-"));
  const workspaceRoot = join(root, "workspaces");
  await mkdir(workspaceRoot);

  try {
    const manager = createLocalWorkspaceManager({ workspaceRoot });
    const [first, second] = await Promise.all([
      manager.allocate({ projectId: "project-a", attemptId: "a-1" }),
      manager.allocate({ projectId: "project-b", attemptId: "b-1" }),
    ]);

    assert.notEqual(first.path, second.path);
    assert.equal(await pathExists(first.path), true);
    assert.equal(await pathExists(second.path), true);

    await Promise.all([manager.release(first), manager.release(second)]);

    assert.equal(await pathExists(first.path), false);
    assert.equal(await pathExists(second.path), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
