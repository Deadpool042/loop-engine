// Electron preload script — runs in an isolated context (contextIsolation:
// true) with access to Node/Electron APIs but no shared globals with the
// renderer. Exposes exactly the narrow API from preload-api.ts under
// `window.loopGuiApi`; the renderer never sees ipcRenderer, child_process,
// or the filesystem directly.
import { contextBridge, ipcRenderer } from "electron";
import { KNOWN_CHANNELS } from "../shared/ipc-channels.js";
import { createLoopGuiApi } from "./preload-api.js";

const api = createLoopGuiApi({
  invoke(channel, ...args) {
    if (!KNOWN_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Unknown IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
});

contextBridge.exposeInMainWorld("loopGuiApi", api);
