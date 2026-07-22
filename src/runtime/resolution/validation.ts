import { runtimeResolutionError } from "./errors.js";
import type { RuntimeResolutionError, RuntimeResolutionInput } from "./types.js";

export function validateRuntimeResolution(
  input: RuntimeResolutionInput | null,
): readonly RuntimeResolutionError[] {
  if (!input) {
    return [runtimeResolutionError("runtime_resolution_missing", "Runtime Resolution input is required.")];
  }
  if (!input.id || !input.version || !input.resolvedAt) {
    return [
      runtimeResolutionError(
        "runtime_resolution_invalid",
        "Runtime Resolution identifiers and explicit time are required.",
      ),
    ];
  }
  if (!input.request.id || !input.request.version) {
    return [
      runtimeResolutionError("runtime_resolution_request_missing", "Runtime Request reference is required."),
    ];
  }
  if (
    !input.request.constructible ||
    input.request.executionAllowed ||
    input.request.executionStarted
  ) {
    return [
      runtimeResolutionError("runtime_resolution_request_invalid", "Runtime Request reference is invalid."),
    ];
  }
  return [];
}
