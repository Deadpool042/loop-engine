import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { createCliInvoker } from "../cli-invoker.js";
import { createGuiConfigStore } from "../config-store.js";
import { createProviderKeychainReader } from "../keychain-reader.js";
import { resolveLoopEngineRepositoryPath } from "../repo-path-resolver.js";
import { createContextHandler } from "./context-handler.js";
import { createPlanHandler } from "./plan-handler.js";
import { createExecuteHandler, DESKTOP_EXECUTE_CLI_TIMEOUT_MS } from "./execute-handler.js";
import { createExecutionWindowCloseGuard } from "./execution-window-close-guard.js";
import {
  createExecutionSessionManager,
  createObservableExecuteCliInvoker,
} from "./execution-session.js";
import {
  createRoadmapProposalHandler,
  DESKTOP_ROADMAP_PROPOSAL_TIMEOUT_MS,
} from "./roadmap-proposal-handler.js";
import { createReviewHandler } from "./review-handler.js";
import { createSummaryHandler } from "./summary-handler.js";

const cliInvoker = createCliInvoker();
const roadmapProposalCliInvoker = createCliInvoker({
  timeoutMs: DESKTOP_ROADMAP_PROPOSAL_TIMEOUT_MS + 5_000,
});
const executionCloseGuard = createExecutionWindowCloseGuard();
let mainWindow: BrowserWindow | null = null;

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
  window.on("close", (event) => {
    executionCloseGuard.preventClose(event);
  });
  await window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow = window;
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

const executionSessions = createExecutionSessionManager({
  createExecuteHandler(onProgress) {
    return createExecuteHandler({
      cliInvoker: createObservableExecuteCliInvoker({
        timeoutMs: DESKTOP_EXECUTE_CLI_TIMEOUT_MS,
        onProgress,
      }),
      resolveRepositoryPath,
      async choosePatchDestination(defaultPath) {
        const options = {
          title: "Exporter le patch validé",
          defaultPath,
          filters: [{ name: "Git patch", extensions: ["patch"] }],
        };
        const result = mainWindow
          ? await dialog.showSaveDialog(mainWindow, options)
          : await dialog.showSaveDialog(options);
        return result.canceled || !result.filePath ? null : result.filePath;
      },
    });
  },
});

async function startExecutionSession(request: unknown) {
  const started = await executionSessions.start(request);
  if (!started.ok) return started;
  void executionCloseGuard.run(() => executionSessions.waitForCompletion(started.session.id));
  return started;
}

const roadmapProposalHandler = createRoadmapProposalHandler({
  cliInvoker: roadmapProposalCliInvoker,
  resolveRepositoryPath,
  keychainReader: createProviderKeychainReader(),
});
ipcMain.handle("loop:roadmap-proposal", (_event, projectName) =>
  roadmapProposalHandler(projectName),
);

ipcMain.handle("loop:execution-start", (_event, request) => startExecutionSession(request));
ipcMain.handle("loop:execution-session", (_event, sessionId) => executionSessions.get(sessionId));
ipcMain.handle("loop:execute", async (_event, request) => {
  const started = await startExecutionSession(request);
  if (!started.ok) return started;
  await executionSessions.waitForCompletion(started.session.id);
  return executionSessions.get(started.session.id)?.result ?? {
    ok: false as const,
    kind: "spawn-error" as const,
    raw: "Execution session result is unavailable.",
  };
});

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
