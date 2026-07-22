import { OPENCLAW_OPERATION_REGISTRY } from "./protocol.js";
import {
  createOpenClawProtocolError,
  diagnosticFromError,
  validProtocolDiagnostic,
} from "./diagnostics.js";
import { OPENCLAW_PROTOCOL_VERSIONS } from "./types.js";
import type {
  OpenClawProtocolDiagnostic,
  OpenClawProtocolError,
  OpenClawProtocolMetadata,
  OpenClawProtocolValidation,
  OpenClawRequest,
} from "./types.js";

const FORBIDDEN_FIELD =
  /credential|secret|token|api[_-]?key|authorization|password|environment|command|shell/i;

function hasForbiddenField(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => FORBIDDEN_FIELD.test(key) || hasForbiddenField(nested),
  );
}

function hasExactValues<T>(
  actual: readonly T[],
  expected: readonly T[],
): boolean {
  return (
    actual.length === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

function addError(
  errors: OpenClawProtocolError[],
  code: OpenClawProtocolError["code"],
  message: string,
  details: OpenClawProtocolMetadata = {},
): void {
  errors.push(createOpenClawProtocolError(code, message, details));
}

/** Pure structural validation. Policy authorization and execution stay separate. */
export function validateOpenClawProtocolRequest(
  request: OpenClawRequest,
): OpenClawProtocolValidation {
  const errors: OpenClawProtocolError[] = [];

  if (request.protocolVersion.length === 0) {
    addError(
      errors,
      "openclaw_protocol_version_missing",
      "Protocol version is required.",
    );
  } else if (
    !OPENCLAW_PROTOCOL_VERSIONS.includes(request.protocolVersion as never)
  ) {
    addError(
      errors,
      "openclaw_protocol_version_unsupported",
      "Protocol version is not supported.",
    );
  }

  if (request.operation.length === 0) {
    addError(
      errors,
      "openclaw_operation_missing",
      "Protocol operation is required.",
    );
  }
  const definition = OPENCLAW_OPERATION_REGISTRY.find(
    (candidate) => candidate.operation === request.operation,
  );
  if (request.operation.length > 0 && !definition) {
    addError(
      errors,
      "openclaw_operation_unsupported",
      "Protocol operation is not supported.",
    );
  }

  if (
    request.input.projectId.trim().length === 0 ||
    request.input.taskId.trim().length === 0
  ) {
    addError(
      errors,
      "openclaw_request_invalid",
      "Project and task identity are required.",
    );
  }
  if (
    request.input.context.projectId !== request.input.projectId ||
    !Number.isSafeInteger(request.input.context.fileCount) ||
    request.input.context.fileCount < 0 ||
    request.input.context.totalCharacters < 0 ||
    request.input.context.estimatedTokens < 0
  ) {
    addError(
      errors,
      "openclaw_context_invalid",
      "Context reference is inconsistent or invalid.",
    );
  }
  if (request.providerId !== "openclaw" || request.provider !== "local") {
    addError(
      errors,
      "openclaw_request_invalid",
      "OpenClaw provider identity is invalid.",
    );
  }
  if (request.runtimeId !== "openclaw") {
    addError(
      errors,
      "openclaw_runtime_not_supported",
      "OpenClaw runtime is required.",
    );
  }

  if (definition) {
    if (
      !hasExactValues(
        request.requiredProviderCapabilities,
        definition.requiredProviderCapabilities,
      )
    ) {
      addError(
        errors,
        "openclaw_capability_not_supported",
        "Provider capabilities do not match the operation.",
      );
    }
    if (
      !definition.requiredAgentPermissions.every((permission) =>
        request.requiredPermissions.includes(permission),
      )
    ) {
      addError(
        errors,
        "openclaw_permission_denied",
        "Required protocol permission is absent.",
      );
    }
    if (
      !hasExactValues(
        request.requiredRuntimeCapabilities,
        definition.requiredRuntimeCapabilities,
      )
    ) {
      addError(
        errors,
        "openclaw_runtime_not_supported",
        "Runtime capabilities do not match the operation.",
      );
    }
    if (
      !hasExactValues(
        request.requiredTransportCapabilities,
        definition.requiredTransportCapabilities,
      )
    ) {
      addError(
        errors,
        "openclaw_transport_not_supported",
        "Transport capabilities do not match the operation.",
      );
    }
  }

  if (hasForbiddenField(request.metadata)) {
    addError(
      errors,
      "openclaw_request_invalid",
      "Protocol metadata contains a forbidden field category.",
      { field: "metadata" },
    );
  }

  const diagnostics: readonly OpenClawProtocolDiagnostic[] =
    errors.length === 0
      ? [validProtocolDiagnostic()]
      : errors.map(diagnosticFromError);
  return Object.freeze({
    valid: errors.length === 0,
    diagnostics: Object.freeze([...diagnostics]),
    ...(errors.length === 0 ? {} : { error: errors[0] }),
  });
}
