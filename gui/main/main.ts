// Electron main process — the only privileged surface of the GUI Cockpit.
// Owns the BrowserWindow, the config store, and the exhaustive set of
// ipcMain handlers (exactly the channels in shared/ipc-channels.ts).
//
// Lot 1 scope only: no CLI spawning, no summary/status/next/context/
// prompt/review/plan wiring. Those are a later lot (gui-cockpit.md §9).
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHANNELS } from "../shared/ipc-channels.js";
import { FsConfigIO } from "./config-io-fs.js";
import { GuiConfigStore } from "./config-store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function createConfigStore(): GuiConfigStore {
  const io = new FsConfigIO(app.getPath("userData"));
  return new GuiConfigStore(io);
}

function registerIpcHandlers(store: GuiConfigStore): void {
  ipcMain.handle(CHANNELS.getConfig, async () => store.load());

  ipcMain.handle(CHANNELS.saveRepoPath, async (_event, repoPath: unknown) => {
    if (typeof repoPath !== "string") {
      throw new TypeError("repoPath must be a string");
    }
    return store.saveRepoPath(repoPath);
  });

  ipcMain.handle(CHANNELS.pickRepoDirectory, async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win ?? (undefined as never), {
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 760,
    minHeight: 480,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await win.loadFile(join(__dirname, "..", "renderer", "index.html"));
}

app.whenReady().then(async () => {
  const store = createConfigStore();
  registerIpcHandlers(store);
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
