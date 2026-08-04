// Electron main process — the only privileged surface of the GUI Cockpit.
// Owns the BrowserWindow, the config store, and the exhaustive set of
// ipcMain handlers (exactly the channels in shared/ipc-channels.ts).
//
// summary, next, context, prompt, review and plan are all wired to the real
// Loop CLI (gui-cockpit.md §9, Lot 5).
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHANNELS } from "../shared/ipc-channels.js";
import { FsConfigIO } from "./config-io-fs.js";
import { DefaultLoopCliContextClient } from "./cli-context-client.js";
import { DefaultLoopCliNextClient } from "./cli-next-client.js";
import { DefaultLoopCliPlanClient } from "./cli-plan-client.js";
import { DefaultLoopCliPromptClient } from "./cli-prompt-client.js";
import { DefaultLoopCliReviewClient } from "./cli-review-client.js";
import { DefaultLoopCliSummaryClient } from "./cli-summary-client.js";
import { DefaultLoopCliValidateClient } from "./cli-validate-client.js";
import { DefaultLoopCliOpenFolderClient } from "./open-project-folder-client.js";
import { GuiConfigStore } from "./config-store.js";
import { NodeProcessRunner } from "./node-process-runner.js";
import { ProjectNextGateway } from "./project-next-gateway.js";
import { ProjectSectionGateway } from "./project-section-gateway.js";
import { registerProjectActionHandler } from "./register-project-action-handler.js";
import { registerProjectSectionHandler } from "./register-project-section-handler.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function createConfigStore(): GuiConfigStore {
  const io = new FsConfigIO(app.getPath("userData"));
  return new GuiConfigStore(io);
}

function registerIpcHandlers(
  store: GuiConfigStore,
  summaryClient: DefaultLoopCliSummaryClient,
  nextClient: DefaultLoopCliNextClient,
  contextClient: DefaultLoopCliContextClient,
  promptClient: DefaultLoopCliPromptClient,
  reviewClient: DefaultLoopCliReviewClient,
  planClient: DefaultLoopCliPlanClient,
  validateClient: DefaultLoopCliValidateClient,
  openFolderClient: DefaultLoopCliOpenFolderClient,
): void {
  const nextGateways = new Map<string, ProjectNextGateway>();
  const contextGateways = new Map<
    string,
    ProjectSectionGateway<Awaited<ReturnType<DefaultLoopCliContextClient["loadProjectContext"]>>>
  >();
  const promptGateways = new Map<
    string,
    ProjectSectionGateway<Awaited<ReturnType<DefaultLoopCliPromptClient["loadProjectPrompt"]>>>
  >();
  const reviewGateways = new Map<
    string,
    ProjectSectionGateway<Awaited<ReturnType<DefaultLoopCliReviewClient["loadProjectReview"]>>>
  >();
  const planGateways = new Map<
    string,
    ProjectSectionGateway<Awaited<ReturnType<DefaultLoopCliPlanClient["loadProjectPlan"]>>>
  >();

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

  ipcMain.handle(CHANNELS.loadWorkspaceSummary, async () => {
    const config = await store.load();
    if (config.repoPath === null) {
      throw new Error("Loop Engine repository path is not configured");
    }
    return summaryClient.loadWorkspaceSummary(config.repoPath);
  });

  ipcMain.handle(CHANNELS.loadProjectNext, async (_event, projectName: unknown) => {
    if (typeof projectName !== "string" || projectName.trim().length === 0) {
      throw new TypeError("projectName must be a non-empty string");
    }

    const config = await store.load();
    if (config.repoPath === null) {
      throw new Error("Loop Engine repository path is not configured");
    }

    let gateway = nextGateways.get(config.repoPath);
    if (!gateway) {
      gateway = new ProjectNextGateway(nextClient, config.repoPath);
      nextGateways.set(config.repoPath, gateway);
    }

    return gateway.load(projectName);
  });

  registerProjectSectionHandler(
    ipcMain,
    CHANNELS.loadProjectContext,
    store,
    contextGateways,
    (repoPath) => (name) => contextClient.loadProjectContext(repoPath, name),
  );

  registerProjectSectionHandler(
    ipcMain,
    CHANNELS.loadProjectPrompt,
    store,
    promptGateways,
    (repoPath) => (name) => promptClient.loadProjectPrompt(repoPath, name),
  );

  registerProjectSectionHandler(
    ipcMain,
    CHANNELS.loadProjectReview,
    store,
    reviewGateways,
    (repoPath) => (name) => reviewClient.loadProjectReview(repoPath, name),
  );

  registerProjectSectionHandler(
    ipcMain,
    CHANNELS.loadProjectPlan,
    store,
    planGateways,
    (repoPath) => (name) => planClient.loadProjectPlan(repoPath, name),
  );

  registerProjectActionHandler(
    ipcMain,
    CHANNELS.validateProject,
    store,
    (repoPath, name) => validateClient.validateProject(repoPath, name),
  );

  registerProjectActionHandler(
    ipcMain,
    CHANNELS.openProjectFolder,
    store,
    (repoPath, name) => openFolderClient.openProjectFolder(repoPath, name),
  );
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 760,
    minHeight: 480,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await win.loadFile(join(__dirname, "..", "renderer", "index.html"));
}

app.whenReady().then(async () => {
  const store = createConfigStore();
  const summaryClient = new DefaultLoopCliSummaryClient(
    new NodeProcessRunner(),
  );
  const nextClient = new DefaultLoopCliNextClient(new NodeProcessRunner());
  const contextClient = new DefaultLoopCliContextClient(
    new NodeProcessRunner(),
  );
  const promptClient = new DefaultLoopCliPromptClient(new NodeProcessRunner());
  const reviewClient = new DefaultLoopCliReviewClient(new NodeProcessRunner());
  const planClient = new DefaultLoopCliPlanClient(new NodeProcessRunner());
  const validateClient = new DefaultLoopCliValidateClient(
    new NodeProcessRunner(),
  );
  const openFolderClient = new DefaultLoopCliOpenFolderClient(contextClient, {
    openPath: (path: string) => shell.openPath(path),
  });
  registerIpcHandlers(
    store,
    summaryClient,
    nextClient,
    contextClient,
    promptClient,
    reviewClient,
    planClient,
    validateClient,
    openFolderClient,
  );
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
