import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GuiConfigStore, type ConfigIO } from "../main/config-store.js";
import { ProjectSectionGateway } from "../main/project-section-gateway.js";
import { registerProjectSectionHandler } from "../main/register-project-section-handler.js";

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

describe("registerProjectSectionHandler", () => {
  it("registers exactly the given channel and forwards the loaded value", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath("/repo-a");
    const gateways = new Map<string, ProjectSectionGateway<{ value: string }>>();

    registerProjectSectionHandler(ipcMain, "gui:load-project-context", store, gateways, () => {
      return async (projectName: string) => ({ value: `context:${projectName}` });
    });

    assert.deepEqual(ipcMain.channels(), ["gui:load-project-context"]);

    const result = await ipcMain.invoke(
      "gui:load-project-context",
      "loop-engine",
      false,
    );

    assert.deepEqual(result, { value: "context:loop-engine" });
  });

  it("rejects an empty project name without touching the store or the loader", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath("/repo-a");
    const gateways = new Map<string, ProjectSectionGateway<unknown>>();
    let loaderCalls = 0;

    registerProjectSectionHandler(ipcMain, "gui:load-project-prompt", store, gateways, () => {
      loaderCalls += 1;
      return async (projectName: string) => ({ projectName });
    });

    await assert.rejects(
      () => Promise.resolve(ipcMain.invoke("gui:load-project-prompt", "  ", false)),
      /projectName must be a non-empty string/,
    );

    assert.equal(loaderCalls, 0);
  });

  it("rejects when the repo path is not configured", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath(null);
    const gateways = new Map<string, ProjectSectionGateway<unknown>>();

    registerProjectSectionHandler(ipcMain, "gui:load-project-review", store, gateways, () => {
      return async (projectName: string) => ({ projectName });
    });

    await assert.rejects(
      () => Promise.resolve(ipcMain.invoke("gui:load-project-review", "loop-engine", false)),
      /Loop Engine repository path is not configured/,
    );
  });

  it("caches the resolved value per project and does not re-invoke the loader on a second call", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath("/repo-a");
    const gateways = new Map<string, ProjectSectionGateway<{ calls: number }>>();
    let calls = 0;

    registerProjectSectionHandler(ipcMain, "gui:load-project-plan", store, gateways, () => {
      return async (projectName: string) => {
        calls += 1;
        return { calls, projectName };
      };
    });

    const first = await ipcMain.invoke("gui:load-project-plan", "loop-engine", false);
    const second = await ipcMain.invoke("gui:load-project-plan", "loop-engine", false);

    assert.deepEqual(first, second);
    assert.equal(calls, 1);
  });

  it("caches independently per repo path", async () => {
    const ipcMain = fakeIpcMain();
    const gateways = new Map<string, ProjectSectionGateway<{ repoPath: string }>>();
    let calls = 0;
    let currentRepoPath = "/repo-a";
    const store = {
      load: async () => ({ repoPath: currentRepoPath }),
    } as GuiConfigStore;

    registerProjectSectionHandler(ipcMain, "gui:load-project-context", store, gateways, (repoPath) => {
      return async () => {
        calls += 1;
        return { repoPath };
      };
    });

    await ipcMain.invoke("gui:load-project-context", "loop-engine", false);
    currentRepoPath = "/repo-b";
    await ipcMain.invoke("gui:load-project-context", "loop-engine", false);

    assert.equal(calls, 2);
    assert.equal(gateways.size, 2);
  });

  it("refresh:true invalidates the cache before reloading", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath("/repo-a");
    const gateways = new Map<string, ProjectSectionGateway<{ calls: number }>>();
    let calls = 0;

    registerProjectSectionHandler(ipcMain, "gui:load-project-context", store, gateways, () => {
      return async () => {
        calls += 1;
        return { calls };
      };
    });

    await ipcMain.invoke("gui:load-project-context", "loop-engine", false);
    const refreshed = await ipcMain.invoke("gui:load-project-context", "loop-engine", true);

    assert.equal(calls, 2);
    assert.deepEqual(refreshed, { calls: 2 });
  });

  it("does not cache a rejection: a retry re-invokes the loader", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath("/repo-a");
    const gateways = new Map<string, ProjectSectionGateway<{ ok: true }>>();
    let calls = 0;

    registerProjectSectionHandler(ipcMain, "gui:load-project-context", store, gateways, () => {
      return async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("boom");
        }
        return { ok: true as const };
      };
    });

    await assert.rejects(
      () => Promise.resolve(ipcMain.invoke("gui:load-project-context", "loop-engine", false)),
      /boom/,
    );

    const value = await ipcMain.invoke("gui:load-project-context", "loop-engine", false);

    assert.equal(calls, 2);
    assert.deepEqual(value, { ok: true });
  });

  it("keeps two sections registered on distinct gateway maps from contaminating each other", async () => {
    const ipcMain = fakeIpcMain();
    const store = storeWithRepoPath("/repo-a");
    const contextGateways = new Map<string, ProjectSectionGateway<{ section: string }>>();
    const promptGateways = new Map<string, ProjectSectionGateway<{ section: string }>>();

    registerProjectSectionHandler(ipcMain, "gui:load-project-context", store, contextGateways, () => {
      return async () => ({ section: "context" });
    });
    registerProjectSectionHandler(ipcMain, "gui:load-project-prompt", store, promptGateways, () => {
      return async () => ({ section: "prompt" });
    });

    const context = await ipcMain.invoke("gui:load-project-context", "loop-engine", false);
    const prompt = await ipcMain.invoke("gui:load-project-prompt", "loop-engine", false);

    assert.deepEqual(context, { section: "context" });
    assert.deepEqual(prompt, { section: "prompt" });
    assert.notEqual(contextGateways, promptGateways);
    assert.equal(contextGateways.size, 1);
    assert.equal(promptGateways.size, 1);
  });
});
