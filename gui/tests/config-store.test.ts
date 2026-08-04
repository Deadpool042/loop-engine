import assert from "node:assert/strict";
import test from "node:test";

import { GuiConfigStore, type ConfigIO } from "../main/config-store.js";

function fakeIo(initial: string | null = null): ConfigIO & { written: string[] } {
  let content = initial;
  return {
    written: [] as string[],
    async read() {
      return content;
    },
    async write(contents: string) {
      content = contents;
      this.written.push(contents);
    },
  };
}

test("load returns repoPath:null when no config file exists", async () => {
  const io = fakeIo(null);
  const store = new GuiConfigStore(io);

  const config = await store.load();

  assert.deepEqual(config, { repoPath: null });
});

test("saveRepoPath persists the path and load reads it back", async () => {
  const io = fakeIo(null);
  const store = new GuiConfigStore(io);

  await store.saveRepoPath("/Users/laurent/Projects/loop-engine");
  const reloaded = await store.load();

  assert.deepEqual(reloaded, { repoPath: "/Users/laurent/Projects/loop-engine" });
  assert.equal(io.written.length, 1);
});

test("saveRepoPath rejects an empty string", async () => {
  const store = new GuiConfigStore(fakeIo(null));

  await assert.rejects(() => store.saveRepoPath(""), TypeError);
  await assert.rejects(() => store.saveRepoPath("   "), TypeError);
});

test("saveRepoPath rejects non-string values at the type boundary", async () => {
  const store = new GuiConfigStore(fakeIo(null));

  // @ts-expect-error — exercising the runtime guard for non-TS callers (IPC boundary)
  await assert.rejects(() => store.saveRepoPath(42), TypeError);
  // @ts-expect-error
  await assert.rejects(() => store.saveRepoPath(null), TypeError);
});

test("load tolerates a malformed config file and falls back to empty config", async () => {
  const io = fakeIo("{ not valid json");
  const store = new GuiConfigStore(io);

  const config = await store.load();

  assert.deepEqual(config, { repoPath: null });
});

test("load ignores a well-formed but shape-invalid config file", async () => {
  const io = fakeIo(JSON.stringify({ somethingElse: true }));
  const store = new GuiConfigStore(io);

  const config = await store.load();

  assert.deepEqual(config, { repoPath: null });
});
