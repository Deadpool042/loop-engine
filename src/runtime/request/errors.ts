import { freezeRuntimeRequestValue } from "./support.js";
import type { RuntimeRequestError, RuntimeRequestErrorCode } from "./types.js";

export const runtimeRequestError = (
  code: RuntimeRequestErrorCode,
  message: string,
): RuntimeRequestError =>
  freezeRuntimeRequestValue({
    code,
    message,
    executionAllowed: false,
    executionStarted: false,
  });
