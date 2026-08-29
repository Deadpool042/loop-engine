import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { withRagIndexLock } from "./rag-index-lock.js";

describe("withRagIndexLock", () => {
  it("waits for a recent lock instead of reclaiming it", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "rag-index-lock-test-"));
    const lockDir = join(workDir, ".lock");
    try {
      mkdirSync(lockDir);

      let observedLockPresentOnEntry = false;
      const held = withRagIndexLock(
        async () => {
          observedLockPresentOnEntry = existsSync(lockDir);
          await new Promise((resolve) => setTimeout(resolve, 50));
          return "done";
        },
        { lockDir, staleThresholdMs: 5_000, pollIntervalMs: 10 },
      );

      // Give withRagIndexLock a few poll cycles to prove it does not reclaim
      // a lock that is only milliseconds old.
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(
        existsSync(lockDir),
        true,
        "a recent externally-held lock must still exist while callback runs",
      );

      rmSync(lockDir, { recursive: true, force: true });
      const result = await held;
      assert.equal(result, "done");
      assert.equal(observedLockPresentOnEntry, true);
      assert.equal(existsSync(lockDir), false);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("reclaims a stale lock and runs the callback", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "rag-index-lock-test-"));
    const lockDir = join(workDir, ".lock");
    try {
      mkdirSync(lockDir);
      const staleTime = new Date(Date.now() - 200);
      utimesSync(lockDir, staleTime, staleTime);

      let callbackRan = false;
      const result = await withRagIndexLock(
        () => {
          callbackRan = true;
          return "reclaimed";
        },
        { lockDir, staleThresholdMs: 50, pollIntervalMs: 10 },
      );

      assert.equal(callbackRan, true);
      assert.equal(result, "reclaimed");
      assert.equal(existsSync(lockDir), false);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("releases the lock after a successful run and after an error", async () => {
    const workDir = mkdtempSync(join(tmpdir(), "rag-index-lock-test-"));
    const lockDir = join(workDir, ".lock");
    try {
      await withRagIndexLock(() => "ok", { lockDir });
      assert.equal(existsSync(lockDir), false);

      await assert.rejects(
        withRagIndexLock(
          () => {
            throw new Error("boom");
          },
          { lockDir },
        ),
      );
      assert.equal(existsSync(lockDir), false);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
