import { contextBridge, ipcRenderer } from "electron";
import { createLoopDesktopApi } from "./desktop-api.js";

export type { LoopDesktopApi } from "./desktop-api.js";

contextBridge.exposeInMainWorld(
  "loopDesktop",
  createLoopDesktopApi((channel, ...args) =>
    ipcRenderer.invoke(channel, ...args),
  ),
);
