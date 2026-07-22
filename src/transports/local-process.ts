import { LocalProcessRuntime } from "../runtime/local-process.js";
import {
  LOCAL_PROCESS_RUNTIME_ID,
  type RuntimeErrorCode,
  type RuntimeResult,
} from "../runtime/types.js";
import {
  createRejectedTransportResult,
  createTransportError,
} from "./errors.js";
import {
  getTransportAuthorizationError,
  getTransportCapabilityError,
} from "./support.js";
import type {
  TransportAdapter,
  TransportError,
  TransportErrorCode,
  TransportAdapterRequest,
  TransportResult,
  TransportStatus,
} from "./types.js";

function transportErrorCode(code: RuntimeErrorCode): TransportErrorCode {
  const codes: Readonly<Record<RuntimeErrorCode, TransportErrorCode>> = {
    permission_denied: "permission_denied",
    runtime_disabled: "transport_disabled",
    invalid_request: "invalid_transport_request",
    executable_not_allowed: "executable_not_allowed",
    working_directory_outside_project: "working_directory_outside_project",
    environment_key_not_allowed: "invalid_transport_request",
    spawn_failed: "transport_execution_failed",
    timed_out: "transport_execution_failed",
    stdout_limit_exceeded: "transport_execution_failed",
    stderr_limit_exceeded: "transport_execution_failed",
    non_zero_exit: "transport_execution_failed",
  };
  return codes[code];
}

function runtimeStatus(status: RuntimeResult["status"]): TransportStatus {
  const statuses: Readonly<Record<RuntimeResult["status"], TransportStatus>> = {
    not_implemented: "not_supported",
    unsupported: "not_supported",
    completed: "completed",
    denied: "rejected",
    spawn_failed: "spawn_failed",
    non_zero_exit: "non_zero_exit",
    timed_out: "timed_out",
    stdout_limit_exceeded: "stdout_limit_exceeded",
    stderr_limit_exceeded: "stderr_limit_exceeded",
  };
  return statuses[status];
}

function executionStarted(result: RuntimeResult): boolean {
  return (
    result.error?.processStarted === true ||
    result.events?.some((event) => event.type === "process_started") === true
  );
}

function durationMs(startedAt: string, completedAt: string): number {
  const duration = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : 0;
}

function normalizeLocalProcessResult(
  request: TransportAdapterRequest,
  result: RuntimeResult,
): TransportResult {
  const error = result.error;
  const normalizedError: TransportError | undefined = error
    ? createTransportError(
        transportErrorCode(error.code),
        error.message,
        { runtimeErrorCode: error.code },
        error.processStarted,
      )
    : undefined;

  return {
    transportId: "local-process",
    providerId: request.providerId,
    runtimeId: request.runtimeId,
    status: runtimeStatus(result.status),
    executionStarted: executionStarted(result),
    exitCode: result.exitCode ?? null,
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    durationMs: durationMs(result.startedAt, result.completedAt),
    events: result.events ?? [],
    diagnostics: result.diagnostics,
    metadata: request.metadata,
    ...(normalizedError === undefined ? {} : { error: normalizedError }),
  };
}

function validate(request: TransportAdapterRequest): TransportError | null {
  if (request.transportId !== "local-process") {
    return createTransportError(
      "invalid_transport_request",
      "Local-process transport must be requested explicitly.",
    );
  }

  return (
    getTransportAuthorizationError(request) ??
    getTransportCapabilityError(LocalProcessTransport, request)
  );
}

/**
 * The sole V10.3 adapter allowed to invoke the V10.1 guarded backend. It
 * constructs no provider command and delegates all process validation and I/O.
 */
export const LocalProcessTransport: TransportAdapter = {
  id: "local-process",
  capabilities: ["shell_exec"],
  supports: (request) => validate(request) === null,
  async execute(request): Promise<TransportResult> {
    const validationError = validate(request);
    if (validationError) {
      return createRejectedTransportResult(request, validationError);
    }

    const result = await LocalProcessRuntime.execute({
      ...request.runtimeRequest,
      provider: request.provider,
      requestedRuntime: LOCAL_PROCESS_RUNTIME_ID,
      localProcess: {
        command: request.command,
        executionPolicy: request.localProcessPolicy,
      },
      metadata: request.metadata,
    });
    return normalizeLocalProcessResult(request, result);
  },
};
