import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { createCliInvoker } from "../cli-invoker.js";
import { createGuiConfigStore } from "../config-store.js";
import { resolveLoopEngineRepositoryPath } from "../repo-path-resolver.js";
import { createContextHandler } from "./context-handler.js";
import { createPlanHandler } from "./plan-handler.js";
import { createReviewHandler } from "./review-handler.js";
import { createSummaryHandler } from "./summary-handler.js";

const cliInvoker = createCliInvoker();

function resolveRepositoryPath(): string | null {
  const configStore = createGuiConfigStore(
    join(app.getPath("userData"), "gui.json"),
  );
  return resolveLoopEngineRepositoryPath({
    configuredRepositoryPath: configStore.read().repositoryPath,
    startPath: app.getAppPath(),
  });
}

async function createMainWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  await window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
}

ipcMain.handle(
  "loop:summary",
  createSummaryHandler({
    cliInvoker,
    resolveRepositoryPath,
  }),
);

const contextHandler = createContextHandler({
  cliInvoker,
  resolveRepositoryPath,
});
ipcMain.handle("loop:context", (_event, projectName) =>
  contextHandler(projectName),
);

const reviewHandler = createReviewHandler({
  cliInvoker,
  resolveRepositoryPath,
});
ipcMain.handle("loop:review", (_event, projectName) =>
  reviewHandler(projectName),
);

const planHandler = createPlanHandler({
  cliInvoker,
  resolveRepositoryPath,
});
ipcMain.handle("loop:plan", (_event, projectName, candidateId) =>
  planHandler(projectName, candidateId),
);

app.whenReady().then(async () => {
  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
