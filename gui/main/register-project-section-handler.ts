// Shared registration for the four cached, single-flight, per-repo project
// section IPC handlers (context, prompt, review, plan). Each call site still
// declares its own literal channel and its own gateway Map, so channels and
// per-section cache isolation stay exactly as explicit as before this
// extraction — only the repeated wiring logic is centralized here.
import type { GuiConfigStore } from "./config-store.js";
import {
  ProjectSectionGateway,
  type ProjectSectionLoader,
} from "./project-section-gateway.js";

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => unknown,
  ): void;
}

export function registerProjectSectionHandler<T>(
  ipcMain: IpcMainLike,
  channel: string,
  store: GuiConfigStore,
  gateways: Map<string, ProjectSectionGateway<T>>,
  makeLoader: (repoPath: string) => ProjectSectionLoader<T>,
): void {
  ipcMain.handle(channel, async (_event, projectName: unknown, refresh: unknown) => {
    if (typeof projectName !== "string" || projectName.trim().length === 0) {
      throw new TypeError("projectName must be a non-empty string");
    }

    const config = await store.load();
    if (config.repoPath === null) {
      throw new Error("Loop Engine repository path is not configured");
    }

    let gateway = gateways.get(config.repoPath);
    if (!gateway) {
      gateway = new ProjectSectionGateway(makeLoader(config.repoPath));
      gateways.set(config.repoPath, gateway);
    }

    if (refresh === true) {
      gateway.invalidate(projectName);
    }

    return gateway.load(projectName);
  });
}
