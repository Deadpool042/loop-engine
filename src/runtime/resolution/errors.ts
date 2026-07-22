import { freezeRuntimeResolutionValue } from "./support.js";
import type { RuntimeResolutionError, RuntimeResolutionErrorCode } from "./types.js";

export const runtimeResolutionError = (
  code: RuntimeResolutionErrorCode,
  message: string,
): RuntimeResolutionError =>
  freezeRuntimeResolutionValue({
    code,
    message,
    executionAllowed: false,
    executionStarted: false,
  });
