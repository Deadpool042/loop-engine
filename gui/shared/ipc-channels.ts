// Exhaustive list of IPC channels the renderer is allowed to invoke.
// This is the single source of truth for the narrow API surface exposed
// across the contextBridge — see main/preload.ts and main/preload-api.ts.
// No generic "execute command" channel exists here by design.
export const CHANNELS = {
  getConfig: "gui:get-config",
  saveRepoPath: "gui:save-repo-path",
  pickRepoDirectory: "gui:pick-repo-directory",
  loadWorkspaceSummary: "gui:load-workspace-summary",
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

export const KNOWN_CHANNELS: ReadonlySet<string> = new Set(Object.values(CHANNELS));
