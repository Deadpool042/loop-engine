import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCliInvoker } from "../../src/gui/cli-invoker.js";
import { createLoopDesktopApi } from "../../src/gui/desktop/desktop-api.js";
import { createContextHandler } from "../../src/gui/desktop/context-handler.js";
import { createReviewHandler } from "../../src/gui/desktop/review-handler.js";
import { createSummaryHandler } from "../../src/gui/desktop/summary-handler.js";
import { resolveLoopEngineRepositoryPath } from "../../src/gui/repo-path-resolver.js";

describe("GUI desktop execution boundary", () => {
  it("exposes a parameterless renderer summary API", async () => {
    const calls: Array<readonly [string, string | undefined]> = [];
    const api = createLoopDesktopApi(async (channel, projectName) => {
      calls.push([channel, projectName]);
      return { ok: false, kind: "spawn-error", raw: "unavailable" };
    });

    assert.equal(api.summary.length, 0);
    await api.summary();
    await api.context("loop-engine");
    await api.review("loop-engine");
    assert.deepEqual(calls, [
      ["loop:summary", undefined],
      ["loop:context", "loop-engine"],
      ["loop:review", "loop-engine"],
    ]);
  });

  it("passes the renderer project name to review while retaining the trusted cwd", async () => {
    const cwdValues: string[] = [];
    const cliInvoker = createCliInvoker({
      execute: async (_executable, args, cwd) => {
        assert.deepEqual(args, ["loop", "review", "creatyss", "--json"]);
        cwdValues.push(cwd);
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    });
    const handler = createReviewHandler({
      cliInvoker,
      resolveRepositoryPath: () => "/trusted/loop-engine",
    });

    await handler("creatyss");

    assert.deepEqual(cwdValues, ["/trusted/loop-engine"]);
  });

  it("passes the renderer project name to context while retaining the trusted cwd", async () => {
    const cwdValues: string[] = [];
    const cliInvoker = createCliInvoker({
      execute: async (_executable, args, cwd) => {
        assert.deepEqual(args, ["loop", "context", "creatyss", "--json"]);
        cwdValues.push(cwd);
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    });
    const handler = createContextHandler({
      cliInvoker,
      resolveRepositoryPath: () => "/trusted/loop-engine",
    });

    await handler("creatyss");

    assert.deepEqual(cwdValues, ["/trusted/loop-engine"]);
  });

  it("uses only the configured or detected Loop Engine repository as CLI cwd", async () => {
    const trustedRepositoryPath = "/trusted/loop-engine";
    const cwdValues: string[] = [];
    const cliInvoker = createCliInvoker({
      execute: async (_executable, _args, cwd) => {
        cwdValues.push(cwd);
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    });
    const handler = createSummaryHandler({
      cliInvoker,
      resolveRepositoryPath: () =>
        resolveLoopEngineRepositoryPath({
          configuredRepositoryPath: trustedRepositoryPath,
          startPath: "/detected/loop-engine",
          resolver: {
            detect(path) {
              if (path === trustedRepositoryPath) return trustedRepositoryPath;
              if (path === "/detected/loop-engine")
                return "/detected/loop-engine";
              return null;
            },
          },
        }),
    });

    await handler("/renderer-controlled/repository" as never);

    assert.deepEqual(cwdValues, [trustedRepositoryPath]);
  });
});
