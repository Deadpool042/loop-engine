import type { ExecutionBridgeError, ExecutionBridgeErrorCode } from "./types.js"; import { freezeExecutionBridgeValue } from "./support.js";
export const executionBridgeError = (code: ExecutionBridgeErrorCode, message: string): ExecutionBridgeError => freezeExecutionBridgeValue({ code, message, executionAllowed: false, executionStarted: false });
