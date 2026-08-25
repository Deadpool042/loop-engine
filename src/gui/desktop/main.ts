import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { join } from "node:path";
import { createCliInvoker } from "../cli-invoker.js";
import { createGuiConfigStore } from "../config-store.js";
import { createProviderKeychainReader } from "../keychain-reader.js";
import { resolveLoopEngineRepositoryPath } from "../repo-path-resolver.js";
import { createContextHandler } from "./context-handler.js";
import { createPlanHandler } from "./plan-handler.js";
import {
  createExecuteHandler,
  DESKTOP_EXECUTE_CLI_TIMEOUT_MS,
} from "./execute-handler.js";
import { createExecutionWindowCloseGuard } from "./execution-window-close-guard.js";
import {
  createExecutionSessionManager,
  createObservableExecuteCliInvoker,
} from "./execution-session.js";
import {
  createRoadmapProposalHandler,
  DESKTOP_ROADMAP_PROPOSAL_TIMEOUT_MS,
} from "./roadmap-proposal-handler.js";
import { createRoadmapProposalEstimateHandler } from "./roadmap-proposal-estimate-handler.js";
import { createGateReassessmentHandler, DESKTOP_GATE_REASSESSMENT_TIMEOUT_MS } from "./gate-reassessment-handler.js";
import { createGateReassessmentEstimateHandler } from "./gate-reassessment-estimate-handler.js";
import { createReviewHandler } from "./review-handler.js";
import { createRunHistoryHandler } from "./run-history-handler.js";
import { createRunHistoryLookupHandler } from "./run-history-lookup-handler.js";
import { createCandidateReviewHandler } from "./candidate-review-handler.js";
import { createSummaryHandler } from "./summary-handler.js";
import { createDesktopExecutionDecisionController } from "./execution-decision-controller.js";
import { createPatchReviewHandler } from "./patch-review-handler.js";
import { DESKTOP_EXECUTION_DECISION_TIMEOUT_MS } from "./execution-decision-cli-proposer.js";
import { DESKTOP_EXECUTION_DECISION_CURRENT_TIMEOUT_MS } from "./execution-decision-cli-current.js";

export const DESKTOP_MAIN_PROCESS_BUILD_IDENTIFIER = process.env.GIT_COMMIT ?? "development";

const cliInvoker = createCliInvoker();
const roadmapProposalCliInvoker = createCliInvoker({
  timeoutMs: DESKTOP_ROADMAP_PROPOSAL_TIMEOUT_MS + 5_000,
});
const gateReassessmentCliInvoker = createCliInvoker({ timeoutMs: DESKTOP_GATE_REASSESSMENT_TIMEOUT_MS + 5_000 });
const executionDecisionCliInvoker = createCliInvoker({ timeoutMs: DESKTOP_EXECUTION_DECISION_TIMEOUT_MS + 7_000 });
const executionDecisionCurrentCliInvoker = createCliInvoker({ timeoutMs: DESKTOP_EXECUTION_DECISION_CURRENT_TIMEOUT_MS });
const executionCloseGuard = createExecutionWindowCloseGuard();
const executionDecisionController = createDesktopExecutionDecisionController({ keychainReader: createProviderKeychainReader(), cliInvoker: executionDecisionCliInvoker, currentCliInvoker: executionDecisionCurrentCliInvoker, resolveRepositoryPath });
if (process.env.NODE_ENV !== "production") console.info(`Loop Engine main process: ${DESKTOP_MAIN_PROCESS_BUILD_IDENTIFIER}`);
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

const runHistoryHandler = createRunHistoryHandler({
  cliInvoker,
  resolveRepositoryPath,
});
ipcMain.handle("loop:runs", (_event, projectName) =>
  runHistoryHandler(projectName),
);

const runHistoryLookupHandler = createRunHistoryLookupHandler({
  cliInvoker,
  resolveRepositoryPath,
});
ipcMain.handle("loop:run-lookup", (_event, projectName, runId) =>
  runHistoryLookupHandler(projectName, runId),
);

const candidateReviewHandler = createCandidateReviewHandler({
  cliInvoker,
  resolveRepositoryPath,
});
ipcMain.handle("loop:candidate-review", (_event, projectName, runId) =>
  candidateReviewHandler(projectName, runId),
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
    const observableCliInvoker = createObservableExecuteCliInvoker({
      timeoutMs: DESKTOP_EXECUTE_CLI_TIMEOUT_MS,
      onProgress,
    });
    const handler = createExecuteHandler({
      cliInvoker: observableCliInvoker,
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
    return { handler, cancel: observableCliInvoker.cancel };
  },
});

async function startExecutionSession(request: unknown) {
  const started = await executionSessions.start(request);
  if (!started.ok) return started;
  void executionCloseGuard.run(() =>
    executionSessions.waitForCompletion(started.session.id),
  );
  return started;
}

const roadmapProposalHandler = createRoadmapProposalHandler({
  cliInvoker: roadmapProposalCliInvoker,
  resolveRepositoryPath,
  keychainReader: createProviderKeychainReader(),
});
ipcMain.handle(
  "loop:roadmap-proposal",
  (_event, projectName, profileOverride) =>
    roadmapProposalHandler(projectName, profileOverride),
);

const roadmapProposalEstimateHandler = createRoadmapProposalEstimateHandler({
  cliInvoker,
  resolveRepositoryPath,
});
ipcMain.handle("loop:roadmap-proposal-estimate", (_event, projectName) =>
  roadmapProposalEstimateHandler(projectName),
);
const gateReassessmentHandler = createGateReassessmentHandler({ cliInvoker: gateReassessmentCliInvoker, resolveRepositoryPath, keychainReader: createProviderKeychainReader() });
ipcMain.handle("loop:gate-reassessment", (_event, projectName, profileOverride) => gateReassessmentHandler(projectName, profileOverride));
const gateReassessmentEstimateHandler = createGateReassessmentEstimateHandler({ cliInvoker, resolveRepositoryPath });
ipcMain.handle("loop:gate-reassessment-estimate", (_event, projectName) => gateReassessmentEstimateHandler(projectName));
ipcMain.handle("loop:execution-decision-prepare", (_event, projectName) => executionDecisionController.prepare(projectName));
ipcMain.handle("loop:execution-decision-approve", (_event, draftId) => executionDecisionController.approve(draftId));

ipcMain.handle("loop:execution-start", (_event, request) =>
  startExecutionSession(request),
);
ipcMain.handle("loop:execution-session", (_event, sessionId) =>
  executionSessions.get(sessionId),
);
ipcMain.handle("loop:execution-cancel", (_event, sessionId) =>
  executionSessions.cancel(sessionId),
);
const patchReviewHandler = createPatchReviewHandler({ getSession: (sessionId) => executionSessions.get(sessionId) });
ipcMain.handle("loop:patch-review", (_event, sessionId) => patchReviewHandler(sessionId));
ipcMain.handle("loop:execute", async (_event, request) => {
  const started = await startExecutionSession(request);
  if (!started.ok) return started;
  await executionSessions.waitForCompletion(started.session.id);
  return (
    executionSessions.get(started.session.id)?.result ?? {
      ok: false as const,
      kind: "spawn-error" as const,
      raw: "Execution session result is unavailable.",
    }
  );
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
