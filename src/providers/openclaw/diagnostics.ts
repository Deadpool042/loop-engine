import type {
  OpenClawProtocolDiagnostic,
  OpenClawProtocolError,
  OpenClawProtocolErrorCode,
  OpenClawProtocolMetadata,
} from "./types.js";

export function createOpenClawProtocolError(
  code: OpenClawProtocolErrorCode,
  message: string,
  details: OpenClawProtocolMetadata = {},
): OpenClawProtocolError {
  return { code, message, details, executionStarted: false };
}

export function diagnosticFromError(
  error: OpenClawProtocolError,
): OpenClawProtocolDiagnostic {
  return { code: error.code, message: error.message, details: error.details };
}

export function validProtocolDiagnostic(): OpenClawProtocolDiagnostic {
  return {
    code: "openclaw_protocol_valid",
    message: "OpenClaw protocol request is structurally valid.",
    details: {},
  };
}
