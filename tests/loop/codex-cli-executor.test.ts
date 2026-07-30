import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCodexCliLoopExecutor } from "../../src/loop/codex-cli-executor.js";

describe("createCodexCliLoopExecutor", () => {
  it("accepts only an executable named codex", () => {
    assert.throws(
      () => createCodexCliLoopExecutor({ executable: "/usr/bin/node" }),
      /command named codex/,
    );
    assert.equal(
      typeof createCodexCliLoopExecutor({ executable: "/usr/local/bin/codex" }),
      "function",
    );
  });

  it("rejects non-positive process limits", () => {
    assert.throws(
      () => createCodexCliLoopExecutor({ executable: "codex", timeoutMs: 0 }),
      /timeout must be a positive integer/,
    );
    assert.throws(
      () =>
        createCodexCliLoopExecutor({
          executable: "codex",
          maxOutputBytes: 0,
        }),
      /output limit must be a positive integer/,
    );
  });
});
