import type { BridgeRequestError, BridgeRequestErrorCode } from "./types.js"; import { freezeBridgeRequestValue } from "./support.js";
export const bridgeRequestError = (code: BridgeRequestErrorCode, message: string): BridgeRequestError => freezeBridgeRequestValue({ code, message, executionAllowed: false, executionStarted: false });
