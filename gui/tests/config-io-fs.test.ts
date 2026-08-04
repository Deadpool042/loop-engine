import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FsConfigIO } from "../main/config-io-fs.js";
import { GuiConfigStore } from "../main/config-store.js";

test("FsConfigIO round-trips a repo path through a real temp directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "loop-engine-gui-config-"));
  try {
    const store = new GuiConfigStore(new FsConfigIO(dir));

    assert.deepEqual(await store.load(), { repoPath: null });

    await store.saveRepoPath("/tmp/some-loop-engine-checkout");
    assert.deepEqual(await store.load(), { repoPath: "/tmp/some-loop-engine-checkout" });

    // A second store instance pointed at the same directory must see the
    // same persisted value — this is the "config survives restart" contract.
    const reopened = new GuiConfigStore(new FsConfigIO(dir));
    assert.deepEqual(await reopened.load(), { repoPath: "/tmp/some-loop-engine-checkout" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("FsConfigIO.write creates the base directory if it does not exist yet", async () => {
  const parent = await mkdtemp(join(tmpdir(), "loop-engine-gui-config-parent-"));
  const nested = join(parent, "does", "not", "exist", "yet");
  try {
    const store = new GuiConfigStore(new FsConfigIO(nested));
    await store.saveRepoPath("/tmp/x");
    assert.deepEqual(await store.load(), { repoPath: "/tmp/x" });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
