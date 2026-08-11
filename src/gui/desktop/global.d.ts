import type { LoopDesktopApi } from "./desktop-api.js";

declare global {
  interface Window {
    loopDesktop: LoopDesktopApi;
  }
}

export {};
