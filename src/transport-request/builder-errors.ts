import type {
  TransportRequestBuilderDiagnostic,
  TransportRequestBuilderError,
  TransportRequestBuilderErrorCode,
  TransportRequestBuilderResult,
  TransportRequestBuilderSummary,
  TransportRequestBuilderValidation,
} from "./builder.js";
import type { TransportRequest, TransportRequestMetadata } from "./types.js";

export function createTransportRequestBuilderError(
  code: TransportRequestBuilderErrorCode,
  message: string,
  details: TransportRequestMetadata = {},
): TransportRequestBuilderError {
  return Object.freeze({ code, message, details, executionStarted: false });
}

export function diagnosticFromTransportRequestBuilderError(
  error: TransportRequestBuilderError,
): TransportRequestBuilderDiagnostic {
  return Object.freeze({
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

export function createTransportRequestBuilderValidation(
  error?: TransportRequestBuilderError,
): TransportRequestBuilderValidation {
  if (error === undefined) {
    return Object.freeze({
      valid: true,
      diagnostics: Object.freeze([]),
    });
  }
  const diagnostic = diagnosticFromTransportRequestBuilderError(error);
  return Object.freeze({
    valid: false,
    diagnostics: Object.freeze([diagnostic]),
    error,
  });
}

export function createTransportRequestBuilderResult(
  request: TransportRequest | null,
  summary: TransportRequestBuilderSummary,
  validation: TransportRequestBuilderValidation,
  error: TransportRequestBuilderError | undefined,
  metadata: TransportRequestMetadata,
): TransportRequestBuilderResult {
  return Object.freeze({
    status: request === null ? "rejected" : "built",
    request,
    summary: Object.freeze({ ...summary }),
    validation,
    diagnostics: validation.diagnostics,
    metadata: Object.freeze({ ...metadata }),
    ...(error === undefined ? {} : { error }),
    executionStarted: false,
  });
}
