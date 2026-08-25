import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { createCliInvoker } from "../../src/gui/cli-invoker.js";
import { createLoopDesktopApi } from "../../src/gui/desktop/desktop-api.js";
import { createRunHistoryLookupHandler } from "../../src/gui/desktop/run-history-lookup-handler.js";

describe("run history lookup desktop boundary", () => {
  it("invokes only runs project plus a run id from the trusted repository", async () => {
    const cliInvoker = createCliInvoker({
      execute: async (_executable, args, cwd) => {
        assert.deepEqual(args, [
          "--silent",
          "loop",
          "runs",
          "loop-engine",
          "--run-id",
          "run-old",
          "--json",
        ]);
        assert.equal(cwd, "/trusted/loop-engine");
        return {
          stdout: JSON.stringify({
            schemaVersion: 1,
            project: "loop-engine",
            runId: "run-old",
            found: false,
            code: "not_found",
            corruptedLines: 0,
          }),
          stderr: "",
          exitCode: 1,
        };
      },
    });
    const handler = createRunHistoryLookupHandler({
      cliInvoker,
      resolveRepositoryPath: () => "/trusted/loop-engine",
    });

    const result = await handler("loop-engine", "run-old");
    assert.equal(result.ok, true);
  });

  it("rejects invalid identities before invoking the CLI", async () => {
    let invoked = false;
    const handler = createRunHistoryLookupHandler({
      cliInvoker: {
        async invoke() {
          invoked = true;
          throw new Error("must not be called");
        },
      },
      resolveRepositoryPath: () => "/trusted/loop-engine",
    });

    for (const [project, runId] of [
      [undefined, "run-old"],
      ["loop-engine", undefined],
      ["", "run-old"],
      ["loop-engine", ""],
    ]) {
      const result = await handler(project, runId);
      assert.equal(result.ok, false);
    }
    assert.equal(invoked, false);
  });

  it("exposes only project and run id through the renderer API", async () => {
    const calls: Array<readonly unknown[]> = [];
    const api = createLoopDesktopApi(async (channel, ...args) => {
      calls.push([channel, ...args]);
      return { ok: false, kind: "spawn-error", raw: "unavailable" };
    });

    assert.equal(api.runLookup.length, 2);
    await api.runLookup("loop-engine", "run-old");
    assert.deepEqual(calls, [["loop:run-lookup", "loop-engine", "run-old"]]);
  });

  it("wires a specialized IPC without ref, SHA, path or cwd input", () => {
    const mainSource = readFileSync(
      new URL("../../src/gui/desktop/main.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      mainSource,
      /ipcMain\.handle\("loop:run-lookup", \(_event, projectName, runId\) =>\s*runHistoryLookupHandler\(projectName, runId\),\s*\)/s,
    );
    assert.doesNotMatch(mainSource, /loop:run-lookup[^\n]*(?:ref|sha|path|cwd)/i);
  });
});
