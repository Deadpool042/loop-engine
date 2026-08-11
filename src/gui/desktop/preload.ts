import { contextBridge, ipcRenderer } from "electron";
import type { CliInvocationResult } from "../cli-invoker.js";
import { createLoopDesktopApi } from "./desktop-api.js";

export type { LoopDesktopApi } from "./desktop-api.js";

contextBridge.exposeInMainWorld(
  "loopDesktop",
  createLoopDesktopApi(
    (channel, projectName) =>
      (projectName === undefined
        ? ipcRenderer.invoke(channel)
        : ipcRenderer.invoke(
            channel,
            projectName,
          )) as Promise<CliInvocationResult>,
  ),
);
