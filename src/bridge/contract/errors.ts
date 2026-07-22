import type { BridgeContractError, BridgeContractErrorCode } from "./types.js";
import { freezeBridgeContractValue } from "./support.js";
export const bridgeContractError = (code: BridgeContractErrorCode, message: string): BridgeContractError => freezeBridgeContractValue({ code, message, executionAllowed: false, executionStarted: false });
