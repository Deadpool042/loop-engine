import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { createCliInvoker } from "../../src/gui/cli-invoker.js";
import { createCandidateReviewHandler } from "../../src/gui/desktop/candidate-review-handler.js";
import { createLoopDesktopApi } from "../../src/gui/desktop/desktop-api.js";

describe("candidate review desktop boundary", () => {
  it("invokes only the public candidate review command from project and run id", async () => {
    const cliInvoker = createCliInvoker({
      execute: async (_executable, args, cwd) => {
        assert.deepEqual(args, [
          "--silent",
          "loop",
          "candidate",
          "review",
          "loop-engine",
          "--run-id",
          "run-123",
          "--json",
        ]);
        assert.equal(cwd, "/trusted/loop-engine");
        return {
          stdout: JSON.stringify({ reviewed: false, code: "expected", message: "expected" }),
          stderr: "",
          exitCode: 1,
        };
      },
    });
    const handler = createCandidateReviewHandler({
      cliInvoker,
      resolveRepositoryPath: () => "/trusted/loop-engine",
    });

    const result = await handler("loop-engine", "run-123");
    assert.equal(result.ok, true);
  });

  it("rejects invalid identities before invoking the CLI", async () => {
    let invoked = false;
    const handler = createCandidateReviewHandler({
      cliInvoker: {
        async invoke() {
          invoked = true;
          throw new Error("must not be called");
        },
      },
      resolveRepositoryPath: () => "/trusted/loop-engine",
    });

    for (const [project, runId] of [
      [undefined, "run-123"],
      ["loop-engine", undefined],
      ["", "run-123"],
      ["loop-engine", ""],
    ]) {
      const result = await handler(project, runId);
      assert.equal(result.ok, false);
    }
    assert.equal(invoked, false);
  });

  it("fails closed when the trusted Loop Engine repository cannot be resolved", async () => {
    let invoked = false;
    const handler = createCandidateReviewHandler({
      cliInvoker: {
        async invoke() {
          invoked = true;
          throw new Error("must not be called");
        },
      },
      resolveRepositoryPath: () => null,
    });

    const result = await handler("loop-engine", "run-123");
    assert.deepEqual(result, {
      ok: false,
      kind: "spawn-error",
      raw: "Loop Engine repository could not be resolved.",
    });
    assert.equal(invoked, false);
  });

  it("exposes only project and run id through the renderer API", async () => {
    const calls: Array<readonly unknown[]> = [];
    const api = createLoopDesktopApi(async (channel, ...args) => {
      calls.push([channel, ...args]);
      return { ok: false, kind: "spawn-error", raw: "unavailable" };
    });

    assert.equal(api.candidateReview.length, 2);
    await api.candidateReview("loop-engine", "run-123");
    assert.deepEqual(calls, [
      ["loop:candidate-review", "loop-engine", "run-123"],
    ]);
  });

  it("wires the explicit IPC without accepting ref, SHA, path or cwd", () => {
    const mainSource = readFileSync(
      new URL("../../src/gui/desktop/main.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      mainSource,
      /ipcMain\.handle\("loop:candidate-review", \(_event, projectName, runId\) =>\s*candidateReviewHandler\(projectName, runId\),\s*\)/s,
    );
    assert.doesNotMatch(
      mainSource,
      /loop:candidate-review[^\n]*(?:ref|sha|path|cwd)/i,
    );
  });
});
