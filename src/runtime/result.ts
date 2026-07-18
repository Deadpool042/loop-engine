import type {
  RuntimeMetadata,
  RuntimeRequest,
  RuntimeResult,
} from "./types.js";
import type { RuntimeId } from "./types.js";

function resultMetadata(request: RuntimeRequest): RuntimeMetadata {
  return request.metadata;
}

export function createNotImplementedRuntimeResult(
  runtimeId: RuntimeId,
  request: RuntimeRequest,
): RuntimeResult {
  return {
    runtimeId,
    status: "not_implemented",
    startedAt: request.requestedAt,
    completedAt: request.requestedAt,
    diagnostics: [`Runtime ${runtimeId} is not implemented.`],
    output: null,
    metadata: resultMetadata(request),
  };
}

export function createUnsupportedRuntimeResult(
  request: RuntimeRequest,
  reason: string,
): RuntimeResult {
  return {
    runtimeId: request.requestedRuntime ?? null,
    status: "unsupported",
    startedAt: request.requestedAt,
    completedAt: request.requestedAt,
    diagnostics: [reason],
    output: null,
    metadata: resultMetadata(request),
  };
}
