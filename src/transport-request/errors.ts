import type {
  TransportRequest,
  TransportRequestDiagnostic,
  TransportRequestError,
  TransportRequestErrorCode,
  TransportRequestMetadata,
  TransportRequestResult,
  TransportRequestStatus,
  TransportRequestSummary,
} from "./types.js";

export function createTransportRequestError(
  code: TransportRequestErrorCode,
  message: string,
  details: TransportRequestMetadata = {},
): TransportRequestError {
  return Object.freeze({ code, message, details, executionStarted: false });
}

export function diagnosticFromTransportRequestError(
  error: TransportRequestError,
): TransportRequestDiagnostic {
  return Object.freeze({
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

export function createTransportRequestResult(
  request: TransportRequest,
  status: TransportRequestStatus,
  error: TransportRequestError,
  summary: TransportRequestSummary,
): TransportRequestResult {
  const diagnostic = diagnosticFromTransportRequestError(error);
  return Object.freeze({
    status,
    request,
    summary: Object.freeze({ ...summary }),
    validation: Object.freeze({
      valid: false,
      diagnostics: Object.freeze([diagnostic]),
      error,
    }),
    diagnostics: Object.freeze([diagnostic]),
    metadata: Object.freeze({ ...request.metadata }),
    error,
    executionStarted: false,
  });
}
