import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLocalProjectLockManager } from "./local-project-lock-manager.js";

const HOSTNAME = "lock-test-host";
const OWNER_FILE_NAME = "owner.json";

function lockPath(lockRoot: string, projectId: string): string {
  return join(lockRoot, Buffer.from(projectId, "utf8").toString("base64url"));
}

async function writeOwner(
  lockRoot: string,
  projectId: string,
  owner: Record<string, unknown>,
): Promise<void> {
  const path = lockPath(lockRoot, projectId);
  await mkdir(path);
  await writeFile(join(path, OWNER_FILE_NAME), JSON.stringify(owner), "utf8");
}

function owner(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    version: 1,
    projectId: "project-a",
    attemptId: "crashed-attempt",
    lockId: "crashed-lock",
    pid: 999,
    hostname: HOSTNAME,
    createdAt: "2026-08-18T10:00:00.000Z",
    ...overrides,
  };
}

async function withLockRoot(
  run: (lockRoot: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "loop-project-lock-"));
  const lockRoot = join(root, "locks");
  await mkdir(lockRoot);

  try {
    await run(lockRoot);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function deferred(): Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}> {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return Object.freeze({ promise, resolve });
}

async function assertMissing(path: string): Promise<void> {
  await assert.rejects(access(path));
}

test("publishes a complete owner file with the first canonical lock", async () => {
  await withLockRoot(async (lockRoot) => {
    const manager = createLocalProjectLockManager({
      lockRoot,
      hostname: HOSTNAME,
      ownerProcessId: 101,
    });
    const acquisition = await manager.acquire({
      projectId: "project-a",
      attemptId: "a-1",
    });

    assert.equal(acquisition.acquired, true);
    if (!acquisition.acquired) {
      assert.fail("acquisition must succeed");
    }

    const currentOwner = JSON.parse(
      await readFile(
        join(lockPath(lockRoot, "project-a"), OWNER_FILE_NAME),
        "utf8",
      ),
    ) as Record<string, unknown>;
    assert.deepEqual(currentOwner, {
      version: 1,
      projectId: "project-a",
      attemptId: "a-1",
      lockId: acquisition.handle.lockId,
      pid: 101,
      hostname: HOSTNAME,
      createdAt: currentOwner.createdAt,
    });
    assert.equal(typeof currentOwner.createdAt, "string");
    await manager.release(acquisition.handle);
  });
});

test("cleans a failed unpublished candidate without leaving a canonical lock", async () => {
  await withLockRoot(async (lockRoot) => {
    const interrupted = createLocalProjectLockManager({
      lockRoot,
      hostname: HOSTNAME,
      beforeCanonicalPublish: () => {
        throw new Error("simulated crash before publication");
      },
    });

    await assert.rejects(
      interrupted.acquire({ projectId: "project-a", attemptId: "a-1" }),
      /simulated crash before publication/,
    );
    await assertMissing(lockPath(lockRoot, "project-a"));
    assert.deepEqual(await readdir(lockRoot), []);

    const recovered = createLocalProjectLockManager({
      lockRoot,
      hostname: HOSTNAME,
    });
    const acquisition = await recovered.acquire({
      projectId: "project-a",
      attemptId: "a-2",
    });
    assert.equal(acquisition.acquired, true);
    if (acquisition.acquired) {
      await recovered.release(acquisition.handle);
    }
  });
});

test("acquires a first lock, rejects a live owner, and allows acquisition after release", async () => {
  await withLockRoot(async (lockRoot) => {
    const manager = createLocalProjectLockManager({
      lockRoot,
      hostname: HOSTNAME,
      ownerProcessId: 101,
      inspectProcess: () => "alive",
    });
    const first = await manager.acquire({
      projectId: "project-a",
      attemptId: "a-1",
    });
    const second = await manager.acquire({
      projectId: "project-a",
      attemptId: "a-2",
    });

    assert.equal(first.acquired, true);
    assert.deepEqual(second, { acquired: false, reason: "project_locked" });

    if (!first.acquired) {
      assert.fail("first acquisition must succeed");
    }

    await manager.release(first.handle);
    const third = await manager.acquire({
      projectId: "project-a",
      attemptId: "a-3",
    });
    assert.equal(third.acquired, true);
    if (third.acquired) {
      await manager.release(third.handle);
    }
  });
});

test("release is idempotent", async () => {
  await withLockRoot(async (lockRoot) => {
    const manager = createLocalProjectLockManager({
      lockRoot,
      hostname: HOSTNAME,
    });
    const acquisition = await manager.acquire({
      projectId: "project-a",
      attemptId: "a-1",
    });
    assert.equal(acquisition.acquired, true);
    if (!acquisition.acquired) {
      assert.fail("acquisition must succeed");
    }

    await manager.release(acquisition.handle);
    await manager.release(acquisition.handle);
  });
});

test("recovers a persisted lock only when its same-host owner is demonstrated dead", async () => {
  await withLockRoot(async (lockRoot) => {
    await writeOwner(lockRoot, "project-a", owner());
    const manager = createLocalProjectLockManager({
      lockRoot,
      hostname: HOSTNAME,
      ownerProcessId: 101,
      inspectProcess: (pid) => (pid === 999 ? "dead" : "alive"),
    });

    const acquisition = await manager.acquire({
      projectId: "project-a",
      attemptId: "recovered-attempt",
    });

    assert.equal(acquisition.acquired, true);
    if (!acquisition.acquired) {
      assert.fail("dead owner lock must be recovered");
    }

    const currentOwner = JSON.parse(
      await readFile(
        join(lockPath(lockRoot, "project-a"), OWNER_FILE_NAME),
        "utf8",
      ),
    ) as Record<string, unknown>;
    assert.equal(currentOwner.version, 1);
    assert.equal(currentOwner.projectId, "project-a");
    assert.equal(currentOwner.attemptId, "recovered-attempt");
    assert.equal(currentOwner.pid, 101);
    assert.equal(currentOwner.hostname, HOSTNAME);
    assert.equal(typeof currentOwner.lockId, "string");
    assert.equal(typeof currentOwner.createdAt, "string");
    await manager.release(acquisition.handle);
  });
});

test("does not steal a lock whose owner is alive", async () => {
  await withLockRoot(async (lockRoot) => {
    await writeOwner(lockRoot, "project-a", owner({ pid: 100 }));
    const manager = createLocalProjectLockManager({
      lockRoot,
      hostname: HOSTNAME,
      inspectProcess: () => "alive",
    });

    assert.deepEqual(
      await manager.acquire({ projectId: "project-a", attemptId: "a-2" }),
      {
        acquired: false,
        reason: "project_locked",
      },
    );
  });
});

test("fails closed for corrupt, absent, or ambiguous owner metadata", async (t) => {
  const cases: ReadonlyArray<
    Readonly<{
      name: string;
      owner?: Record<string, unknown>;
      rawOwner?: string;
      inspection?: "unknown";
    }>
  > = [
    { name: "missing metadata" },
    { name: "invalid JSON", rawOwner: "{not-json" },
    { name: "invalid version", owner: owner({ version: 2 }) },
    { name: "wrong project", owner: owner({ projectId: "project-b" }) },
    { name: "invalid attempt", owner: owner({ attemptId: "" }) },
    { name: "invalid pid", owner: owner({ pid: 0 }) },
    { name: "different host", owner: owner({ hostname: "other-host" }) },
    { name: "ambiguous PID inspection", owner: owner(), inspection: "unknown" },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      await withLockRoot(async (lockRoot) => {
        const path = lockPath(lockRoot, "project-a");
        await mkdir(path);
        if (scenario.owner !== undefined || scenario.rawOwner !== undefined) {
          await writeFile(
            join(path, OWNER_FILE_NAME),
            scenario.rawOwner ?? JSON.stringify(scenario.owner),
            "utf8",
          );
        }
        const manager = createLocalProjectLockManager({
          lockRoot,
          hostname: HOSTNAME,
          inspectProcess: () => scenario.inspection ?? "dead",
        });

        assert.deepEqual(
          await manager.acquire({ projectId: "project-a", attemptId: "a-2" }),
          { acquired: false, reason: "project_locked" },
        );
      });
    });
  }
});

test("an old handle cannot remove a replacement lock", async () => {
  await withLockRoot(async (lockRoot) => {
    await writeOwner(lockRoot, "project-a", owner());
    const manager = createLocalProjectLockManager({
      lockRoot,
      hostname: HOSTNAME,
      ownerProcessId: 101,
      inspectProcess: (pid) => (pid === 999 ? "dead" : "alive"),
    });
    const recovered = await manager.acquire({
      projectId: "project-a",
      attemptId: "a-1",
    });
    assert.equal(recovered.acquired, true);
    if (!recovered.acquired) {
      assert.fail("recovery must succeed");
    }

    await rm(lockPath(lockRoot, "project-a"), { recursive: true, force: true });
    await writeOwner(
      lockRoot,
      "project-a",
      owner({ attemptId: "a-2", lockId: "replacement" }),
    );

    await manager.release(recovered.handle);
    assert.equal(
      await readFile(
        join(lockPath(lockRoot, "project-a"), OWNER_FILE_NAME),
        "utf8",
      ),
      JSON.stringify(owner({ attemptId: "a-2", lockId: "replacement" })),
    );
  });
});

test("two concurrent stale-lock recoveries have exactly one acquirer", async () => {
  await withLockRoot(async (lockRoot) => {
    await writeOwner(lockRoot, "project-a", owner());
    const manager = createLocalProjectLockManager({
      lockRoot,
      hostname: HOSTNAME,
      ownerProcessId: 101,
      inspectProcess: (pid) => (pid === 999 ? "dead" : "alive"),
    });

    const results = await Promise.all([
      manager.acquire({ projectId: "project-a", attemptId: "a-1" }),
      manager.acquire({ projectId: "project-a", attemptId: "a-2" }),
    ]);

    assert.equal(results.filter((result) => result.acquired).length, 1);
    assert.equal(results.filter((result) => !result.acquired).length, 1);
    const acquired = results.find((result) => result.acquired);
    if (acquired?.acquired) {
      await manager.release(acquired.handle);
    }
  });
});

test("a recoverer delayed after observing S cannot quarantine replacement N", async () => {
  await withLockRoot(async (lockRoot) => {
    await writeOwner(lockRoot, "project-a", owner());
    const aObservedStale = deferred();
    const bObservedStale = deferred();
    const continueA = deferred();
    const continueB = deferred();
    const managerA = createLocalProjectLockManager({
      lockRoot,
      hostname: HOSTNAME,
      ownerProcessId: 101,
      inspectProcess: (pid) => (pid === 999 ? "dead" : "alive"),
      onStaleOwnerObserved: async () => {
        aObservedStale.resolve();
        await continueA.promise;
      },
    });
    const managerB = createLocalProjectLockManager({
      lockRoot,
      hostname: HOSTNAME,
      ownerProcessId: 102,
      inspectProcess: (pid) => (pid === 999 ? "dead" : "alive"),
      onStaleOwnerObserved: async () => {
        bObservedStale.resolve();
        await continueB.promise;
      },
    });

    const attemptA = managerA.acquire({
      projectId: "project-a",
      attemptId: "a",
    });
    await aObservedStale.promise;
    const attemptB = managerB.acquire({
      projectId: "project-a",
      attemptId: "b",
    });
    await bObservedStale.promise;

    continueA.resolve();
    const resultA = await attemptA;
    assert.equal(resultA.acquired, true);
    if (!resultA.acquired) {
      assert.fail("A must publish replacement N");
    }

    continueB.resolve();
    assert.deepEqual(await attemptB, {
      acquired: false,
      reason: "project_locked",
    });

    const currentOwner = JSON.parse(
      await readFile(
        join(lockPath(lockRoot, "project-a"), OWNER_FILE_NAME),
        "utf8",
      ),
    ) as Record<string, unknown>;
    assert.equal(currentOwner.lockId, resultA.handle.lockId);
    await managerA.release(resultA.handle);
  });
});
