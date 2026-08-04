// Factory for the exact API surface exposed to the renderer via
// contextBridge.exposeInMainWorld (see preload.ts). Kept independent of
// the real `electron` module so it can be unit-tested with a fake bridge
// — see gui/tests/preload-api.test.ts, which asserts this list stays
// narrow and typed (no generic execute(command: string) escape hatch).
import { CHANNELS } from "../shared/ipc-channels.js";
import type { ProjectContextReport } from "../shared/project-context.js";
import type { ProjectNextReport } from "../shared/project-next.js";
import type { ProjectPlanReport } from "../shared/project-plan.js";
import type { ProjectPromptReport } from "../shared/project-prompt.js";
import type { ProjectReviewReport } from "../shared/project-review.js";
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
  loadProjectNext(projectName: string): Promise<ProjectNextReport>;
  loadProjectContext(
    projectName: string,
    refresh?: boolean,
  ): Promise<ProjectContextReport>;
  loadProjectPrompt(
    projectName: string,
    refresh?: boolean,
  ): Promise<ProjectPromptReport>;
  loadProjectReview(
    projectName: string,
    refresh?: boolean,
  ): Promise<ProjectReviewReport>;
  loadProjectPlan(
    projectName: string,
    refresh?: boolean,
  ): Promise<ProjectPlanReport>;
  validateProject(projectName: string): Promise<void>;
  openProjectFolder(projectName: string): Promise<void>;
  autoDetectRepoPath(): Promise<string | null>;
}

export const EXPOSED_API_METHODS = [
  "getConfig",
  "saveRepoPath",
  "pickRepoDirectory",
  "loadWorkspaceSummary",
  "loadProjectNext",
  "loadProjectContext",
  "loadProjectPrompt",
  "loadProjectReview",
  "loadProjectPlan",
  "validateProject",
  "openProjectFolder",
  "autoDetectRepoPath",
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
    loadProjectNext: (projectName: string) => {
      if (typeof projectName !== "string" || projectName.trim().length === 0) {
        return Promise.reject(
          new TypeError("projectName must be a non-empty string"),
        );
      }
      return bridge.invoke(
        CHANNELS.loadProjectNext,
        projectName,
      ) as Promise<ProjectNextReport>;
    },
    loadProjectContext: (projectName: string, refresh = false) => {
      if (typeof projectName !== "string" || projectName.trim().length === 0) {
        return Promise.reject(
          new TypeError("projectName must be a non-empty string"),
        );
      }
      return bridge.invoke(
        CHANNELS.loadProjectContext,
        projectName,
        refresh === true,
      ) as Promise<ProjectContextReport>;
    },
    loadProjectPrompt: (projectName: string, refresh = false) => {
      if (typeof projectName !== "string" || projectName.trim().length === 0) {
        return Promise.reject(
          new TypeError("projectName must be a non-empty string"),
        );
      }
      return bridge.invoke(
        CHANNELS.loadProjectPrompt,
        projectName,
        refresh === true,
      ) as Promise<ProjectPromptReport>;
    },
    loadProjectReview: (projectName: string, refresh = false) => {
      if (typeof projectName !== "string" || projectName.trim().length === 0) {
        return Promise.reject(
          new TypeError("projectName must be a non-empty string"),
        );
      }
      return bridge.invoke(
        CHANNELS.loadProjectReview,
        projectName,
        refresh === true,
      ) as Promise<ProjectReviewReport>;
    },
    loadProjectPlan: (projectName: string, refresh = false) => {
      if (typeof projectName !== "string" || projectName.trim().length === 0) {
        return Promise.reject(
          new TypeError("projectName must be a non-empty string"),
        );
      }
      return bridge.invoke(
        CHANNELS.loadProjectPlan,
        projectName,
        refresh === true,
      ) as Promise<ProjectPlanReport>;
    },
    validateProject: (projectName: string) => {
      if (typeof projectName !== "string" || projectName.trim().length === 0) {
        return Promise.reject(
          new TypeError("projectName must be a non-empty string"),
        );
      }
      return bridge.invoke(CHANNELS.validateProject, projectName) as Promise<void>;
    },
    openProjectFolder: (projectName: string) => {
      if (typeof projectName !== "string" || projectName.trim().length === 0) {
        return Promise.reject(
          new TypeError("projectName must be a non-empty string"),
        );
      }
      return bridge.invoke(
        CHANNELS.openProjectFolder,
        projectName,
      ) as Promise<void>;
    },
    autoDetectRepoPath: () =>
      bridge.invoke(CHANNELS.autoDetectRepoPath) as Promise<string | null>,
  };
}
