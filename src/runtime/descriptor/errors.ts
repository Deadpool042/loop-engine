import { freezeRuntimeDescriptorValue } from "./support.js";
import type { RuntimeDescriptorError, RuntimeDescriptorErrorCode } from "./types.js";
export const runtimeDescriptorError = (code: RuntimeDescriptorErrorCode, message: string): RuntimeDescriptorError => freezeRuntimeDescriptorValue({ code, message });
