import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClaudeCodeCliLoopExecutor } from "../../src/loop/claude-code-cli-executor.js";


describe("createClaudeCodeCliLoopExecutor", () => {
  it("accepts only an executable named claude", () => {
    assert.throws(
      () => createClaudeCodeCliLoopExecutor({ executable: "/usr/bin/node" }),
      /command named claude/,
    );
    assert.equal(
      typeof createClaudeCodeCliLoopExecutor({
        executable: "/usr/local/bin/claude",
      }),
      "function",
    );
  });

  it("rejects non-positive process and turn limits", () => {
    assert.throws(
      () =>
        createClaudeCodeCliLoopExecutor({ executable: "claude", timeoutMs: 0 }),
      /timeout must be a positive integer/,
    );
    assert.throws(
      () =>
        createClaudeCodeCliLoopExecutor({
          executable: "claude",
          maxOutputBytes: 0,
        }),
      /output limit must be a positive integer/,
    );
    assert.throws(
      () =>
        createClaudeCodeCliLoopExecutor({ executable: "claude", maxTurns: 0 }),
      /maxTurns must be a positive integer/,
    );
  });
});
