// Electron main process — the only privileged surface of the GUI Cockpit.
// Owns the BrowserWindow, the config store, and the exhaustive set of
// ipcMain handlers (exactly the channels in shared/ipc-channels.ts).
//
// summary, next, context, prompt, review and plan are all wired to the real
// Loop CLI (gui-cockpit.md §9, Lot 5).
import { app, BrowserWindow, dialog, ipcMain } from "electron";
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
import { GuiConfigStore } from "./config-store.js";
import { NodeProcessRunner } from "./node-process-runner.js";
import { ProjectNextGateway } from "./project-next-gateway.js";
import { ProjectSectionGateway } from "./project-section-gateway.js";

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

  ipcMain.handle(
    CHANNELS.loadProjectContext,
    async (_event, projectName: unknown, refresh: unknown) => {
      if (typeof projectName !== "string" || projectName.trim().length === 0) {
        throw new TypeError("projectName must be a non-empty string");
      }

      const config = await store.load();
      if (config.repoPath === null) {
        throw new Error("Loop Engine repository path is not configured");
      }

      let gateway = contextGateways.get(config.repoPath);
      if (!gateway) {
        gateway = new ProjectSectionGateway((name) =>
          contextClient.loadProjectContext(config.repoPath as string, name),
        );
        contextGateways.set(config.repoPath, gateway);
      }

      if (refresh === true) {
        gateway.invalidate(projectName);
      }

      return gateway.load(projectName);
    },
  );

  ipcMain.handle(
    CHANNELS.loadProjectPrompt,
    async (_event, projectName: unknown, refresh: unknown) => {
      if (typeof projectName !== "string" || projectName.trim().length === 0) {
        throw new TypeError("projectName must be a non-empty string");
      }

      const config = await store.load();
      if (config.repoPath === null) {
        throw new Error("Loop Engine repository path is not configured");
      }

      let gateway = promptGateways.get(config.repoPath);
      if (!gateway) {
        gateway = new ProjectSectionGateway((name) =>
          promptClient.loadProjectPrompt(config.repoPath as string, name),
        );
        promptGateways.set(config.repoPath, gateway);
      }

      if (refresh === true) {
        gateway.invalidate(projectName);
      }

      return gateway.load(projectName);
    },
  );

  ipcMain.handle(
    CHANNELS.loadProjectReview,
    async (_event, projectName: unknown, refresh: unknown) => {
      if (typeof projectName !== "string" || projectName.trim().length === 0) {
        throw new TypeError("projectName must be a non-empty string");
      }

      const config = await store.load();
      if (config.repoPath === null) {
        throw new Error("Loop Engine repository path is not configured");
      }

      let gateway = reviewGateways.get(config.repoPath);
      if (!gateway) {
        gateway = new ProjectSectionGateway((name) =>
          reviewClient.loadProjectReview(config.repoPath as string, name),
        );
        reviewGateways.set(config.repoPath, gateway);
      }

      if (refresh === true) {
        gateway.invalidate(projectName);
      }

      return gateway.load(projectName);
    },
  );

  ipcMain.handle(
    CHANNELS.loadProjectPlan,
    async (_event, projectName: unknown, refresh: unknown) => {
      if (typeof projectName !== "string" || projectName.trim().length === 0) {
        throw new TypeError("projectName must be a non-empty string");
      }

      const config = await store.load();
      if (config.repoPath === null) {
        throw new Error("Loop Engine repository path is not configured");
      }

      let gateway = planGateways.get(config.repoPath);
      if (!gateway) {
        gateway = new ProjectSectionGateway((name) =>
          planClient.loadProjectPlan(config.repoPath as string, name),
        );
        planGateways.set(config.repoPath, gateway);
      }

      if (refresh === true) {
        gateway.invalidate(projectName);
      }

      return gateway.load(projectName);
    },
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
  registerIpcHandlers(
    store,
    summaryClient,
    nextClient,
    contextClient,
    promptClient,
    reviewClient,
    planClient,
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
