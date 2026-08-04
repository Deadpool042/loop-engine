// Shared registration for a single-shot project action IPC handler (validate,
// open folder, ...): validates the project name, resolves the configured
// repo path, and delegates to the injected action. Unlike
// registerProjectSectionHandler, there is no gateway/cache — every call
// re-runs the action — because these are user-triggered one-off commands,
// not cached report reads.
import type { GuiConfigStore } from "./config-store.js";
import type { IpcMainLike } from "./register-project-section-handler.js";

export function registerProjectActionHandler(
  ipcMain: IpcMainLike,
  channel: string,
  store: GuiConfigStore,
  runAction: (repoPath: string, projectName: string) => Promise<void>,
): void {
  ipcMain.handle(channel, async (_event, projectName: unknown) => {
    if (typeof projectName !== "string" || projectName.trim().length === 0) {
      throw new TypeError("projectName must be a non-empty string");
    }

    const config = await store.load();
    if (config.repoPath === null) {
      throw new Error("Loop Engine repository path is not configured");
    }

    await runAction(config.repoPath, projectName);
  });
}
