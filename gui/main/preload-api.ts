// Factory for the exact API surface exposed to the renderer via
// contextBridge.exposeInMainWorld (see preload.ts). Kept independent of
// the real `electron` module so it can be unit-tested with a fake bridge
// — see gui/tests/preload-api.test.ts, which asserts this list stays
// narrow and typed (no generic execute(command: string) escape hatch).
import { CHANNELS } from "../shared/ipc-channels.js";
import type { WorkspaceSummary } from "../shared/workspace-summary.js";
import type { GuiConfig } from "./config-store.js";

export interface Bridge {
  invoke(channel: string, ...args: readonly unknown[]): Promise<unknown>;
}

export interface LoopGuiApi {
  getConfig(): Promise<GuiConfig>;
  saveRepoPath(repoPath: string): Promise<GuiConfig>;
  pickRepoDirectory(): Promise<string | null>;
  loadWorkspaceSummary(): Promise<WorkspaceSummary>;
}

export const EXPOSED_API_METHODS = [
  "getConfig",
  "saveRepoPath",
  "pickRepoDirectory",
  "loadWorkspaceSummary",
] as const;

export function createLoopGuiApi(bridge: Bridge): LoopGuiApi {
  return {
    getConfig: () => bridge.invoke(CHANNELS.getConfig) as Promise<GuiConfig>,
    saveRepoPath: (repoPath: string) => {
      if (typeof repoPath !== "string") {
        return Promise.reject(new TypeError("repoPath must be a string"));
      }
      return bridge.invoke(CHANNELS.saveRepoPath, repoPath) as Promise<GuiConfig>;
    },
    pickRepoDirectory: () =>
      bridge.invoke(CHANNELS.pickRepoDirectory) as Promise<string | null>,
    loadWorkspaceSummary: () =>
      bridge.invoke(CHANNELS.loadWorkspaceSummary) as Promise<WorkspaceSummary>,
  };
}
