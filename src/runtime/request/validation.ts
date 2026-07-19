import { runtimeRequestError } from "./errors.js";
import type { RuntimeRequestError, RuntimeRequestInput } from "./types.js";

export function validateRuntimeRequest(
  input: RuntimeRequestInput | null,
): readonly RuntimeRequestError[] {
  if (!input) {
    return [runtimeRequestError("runtime_request_missing", "Runtime Request input is required.")];
  }
  if (!input.id || !input.version || !input.createdAt) {
    return [
      runtimeRequestError(
        "runtime_request_invalid",
        "Runtime Request identifiers and explicit time are required.",
      ),
    ];
  }
  if (!input.bridge.id || !input.bridge.version) {
    return [
      runtimeRequestError("runtime_request_bridge_missing", "Execution Bridge reference is required."),
    ];
  }
  if (!input.bridge.ready || input.bridge.executionAllowed || input.bridge.executionStarted) {
    return [
      runtimeRequestError("runtime_request_bridge_invalid", "Execution Bridge reference is invalid."),
    ];
  }
  return [];
}
