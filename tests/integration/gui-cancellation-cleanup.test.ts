import assert from "node:assert/strict";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createObservableExecuteCliInvoker } from "../../src/gui/desktop/execution-session.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "..", "..");
const FAKE_CLAUDE = resolve(
  currentDir,
  "..",
  "fixtures",
  "fake-claude",
  "claude",
);

async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}

async function assertNoIsolatedResources(root: string): Promise<void> {
  const isolatedRoot = join(root, "loop-engine-isolated-provider-execution");
  const lockRoot = join(isolatedRoot, "locks");
  const workspaceRoot = join(isolatedRoot, "workspaces");

  assert.deepEqual(await readdir(lockRoot), []);
  assert.deepEqual(await readdir(workspaceRoot), []);
}

describe("GUI cancellation cleanup", () => {
  it(
    "terminates a stubborn provider descendant and waits for isolated worktree/lock cleanup",
    { skip: process.platform === "win32" },
    async () => {
      const root = await mkdtemp(join(tmpdir(), "loop-gui-cancel-"));
      const descendantPidPath = join(root, "descendant.pid");
      const previousTmpdir = process.env.TMPDIR;
      const previousPidPath = process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH;

      process.env.TMPDIR = root;
      process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH = descendantPidPath;

      try {
        const invoker = createObservableExecuteCliInvoker({
          timeoutMs: 30_000,
          terminationGraceMs: 1_000,
          terminationFinalGraceMs: 2_000,
          onProgress: () => {},
        });
        const pending = invoker.invoke(
          "run",
          [
            "loop-engine",
            "--mode",
            "execute",
            "--provider",
            "claude_code",
            "--provider-executable",
            FAKE_CLAUDE,
            "--provider-model",
            "claude-sonnet-5",
            "--provider-timeout-ms",
            "20000",
          ],
          repoRoot,
        );

        const reachedProvider = await Promise.race([
          waitForFile(descendantPidPath).then(() => true),
          pending.then((result) => {
            throw new Error(
              `Execution completed before adversarial provider start: ${JSON.stringify(result)}`,
            );
          }),
        ]);
        assert.equal(reachedProvider, true);

        const descendantPid = Number(
          (await readFile(descendantPidPath, "utf8")).trim(),
        );
        assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0);
        assert.equal(processExists(descendantPid), true);

        assert.equal(invoker.cancel(), true);
        assert.deepEqual(await pending, {
          ok: false,
          kind: "cancelled",
          raw: "CLI invocation was cancelled.",
        });

        assert.equal(processExists(descendantPid), false);
        await assertNoIsolatedResources(root);
      } finally {
        if (previousTmpdir === undefined) delete process.env.TMPDIR;
        else process.env.TMPDIR = previousTmpdir;
        if (previousPidPath === undefined)
          delete process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH;
        else process.env.FAKE_CLAUDE_DESCENDANT_PID_PATH = previousPidPath;
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
