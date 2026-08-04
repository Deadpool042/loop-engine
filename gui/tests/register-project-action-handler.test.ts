import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GuiConfigStore, type ConfigIO } from "../main/config-store.js";
import { registerProjectActionHandler } from "../main/register-project-action-handler.js";

function fakeIo(initial: string | null): ConfigIO {
  return {
    async read() {
      return initial;
    },
    async write() {
      /* not exercised */
    },
  };
}

function storeWithRepoPath(repoPath: string | null): GuiConfigStore {
  return new GuiConfigStore(
    fakeIo(repoPath === null ? null : JSON.stringify({ repoPath })),
  );
}

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function fakeIpcMain(): {
  handle(channel: string, listener: Handler): void;
  invoke(channel: string, ...args: unknown[]): unknown;
  channels(): string[];
} {
  const handlers = new Map<string, Handler>();
  return {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
    invoke(channel, ...args) {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`no handler registered for ${channel}`);
      }
      return handler(undefined, ...args);
    },
    channels() {
      return [...handlers.keys()];
    },
  };
}

describe("registerProjectActionHandler", () => {
  it("registers exactly the given channel and forwards repoPath + projectName", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath("/repo-a");
    const calls: Array<{ repoPath: string; projectName: string }> = [];

    registerProjectActionHandler(
      ipcMain,
      "gui:validate-project",
      store,
      async (repoPath, projectName) => {
        calls.push({ repoPath, projectName });
      },
    );

    assert.deepEqual(ipcMain.channels(), ["gui:validate-project"]);

    const result = await ipcMain.invoke("gui:validate-project", "loop-engine");

    assert.equal(result, undefined);
    assert.deepEqual(calls, [{ repoPath: "/repo-a", projectName: "loop-engine" }]);
  });

  it("rejects an empty project name without touching the store or the action", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath("/repo-a");
    let actionCalls = 0;

    registerProjectActionHandler(ipcMain, "gui:validate-project", store, async () => {
      actionCalls += 1;
    });

    await assert.rejects(
      () => Promise.resolve(ipcMain.invoke("gui:validate-project", "  ")),
      /projectName must be a non-empty string/,
    );

    assert.equal(actionCalls, 0);
  });

  it("rejects when the repo path is not configured", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath(null);
    let actionCalls = 0;

    registerProjectActionHandler(
      ipcMain,
      "gui:open-project-folder",
      store,
      async () => {
        actionCalls += 1;
      },
    );

    await assert.rejects(
      () => Promise.resolve(ipcMain.invoke("gui:open-project-folder", "loop-engine")),
      /Loop Engine repository path is not configured/,
    );
    assert.equal(actionCalls, 0);
  });

  it("re-runs the action on every call — no caching of a fire-once action", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath("/repo-a");
    let calls = 0;

    registerProjectActionHandler(ipcMain, "gui:validate-project", store, async () => {
      calls += 1;
    });

    await ipcMain.invoke("gui:validate-project", "loop-engine");
    await ipcMain.invoke("gui:validate-project", "loop-engine");

    assert.equal(calls, 2);
  });

  it("propagates the action's rejection to the caller", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath("/repo-a");

    registerProjectActionHandler(ipcMain, "gui:validate-project", store, async () => {
      throw new Error("validation failed");
    });

    await assert.rejects(
      () => Promise.resolve(ipcMain.invoke("gui:validate-project", "loop-engine")),
      /validation failed/,
    );
  });
});
