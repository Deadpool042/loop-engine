export type ExecutionBridgeInput = Readonly<{ id: string; version: string; evaluatedAt: string; request: Readonly<{ id: string; version: string; constructible: boolean; executionAllowed: false; executionStarted: false }>; evidenceReferences: readonly string[] }>;
export type ExecutionBridgeCheck = Readonly<{ id: string; passed: boolean; reason: string }>;
export const EXECUTION_BRIDGE_ERROR_CODES = ["execution_bridge_input_missing", "execution_bridge_input_invalid", "execution_bridge_request_invalid", "execution_bridge_request_not_constructible", "execution_bridge_execution_flag_invalid", "execution_bridge_time_missing"] as const;
export type ExecutionBridgeErrorCode = (typeof EXECUTION_BRIDGE_ERROR_CODES)[number];
export type ExecutionBridgeError = Readonly<{ code: ExecutionBridgeErrorCode; message: string; executionAllowed: false; executionStarted: false }>;
export type ExecutionBridgeResult = Readonly<{ input: ExecutionBridgeInput; checks: readonly ExecutionBridgeCheck[]; diagnostics: readonly ExecutionBridgeError[]; valid: boolean; bridgeReady: boolean; executionAllowed: false; executionStarted: false }>;
