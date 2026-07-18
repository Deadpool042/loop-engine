import type {
  TransportError,
  TransportErrorCode,
  TransportMetadata,
  TransportAdapterRequest,
  TransportResult,
} from "./types.js";

export function createTransportError(
  code: TransportErrorCode,
  message: string,
  details: TransportMetadata = {},
  executionStarted = false,
): TransportError {
  return { code, message, details, executionStarted };
}

export function createRejectedTransportResult(
  request: TransportAdapterRequest,
  error: TransportError,
): TransportResult {
  return {
    transportId: request.transportId,
    providerId: request.providerId,
    runtimeId: request.runtimeId,
    status: "rejected",
    executionStarted: false,
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    startedAt: request.runtimeRequest.requestedAt,
    completedAt: request.runtimeRequest.requestedAt,
    durationMs: 0,
    events: [],
    diagnostics: [error.message],
    metadata: request.metadata,
    error,
  };
}
