import type {
  RuntimeAdapter,
  RuntimeErrorCode,
  RuntimeExecutionError,
  RuntimeId,
  RuntimeMetadata,
  RuntimeRequest,
  RuntimeResult,
} from "./types.js";

/** JSON-only output accepted by the deterministic simulated runtime. */
export type SimulatedRuntimeOutput =
  | null
  | boolean
  | number
  | string
  | readonly SimulatedRuntimeOutput[]
  | Readonly<{ readonly [key: string]: SimulatedRuntimeOutput }>;

export type SimulatedRuntimeAdapterOptions = Readonly<{
  runtimeId: RuntimeId;
  outcome: "success" | "failure";
  output?: SimulatedRuntimeOutput;
  errorCode?: RuntimeErrorCode;
}>;

function cloneOutput(output: SimulatedRuntimeOutput | undefined): unknown {
  if (output === undefined) return null;
  return JSON.parse(JSON.stringify(output)) as unknown;
}

function selectedRuntime(request: RuntimeRequest): RuntimeId | null {
  return (
    request.requestedRuntime ??
    (request.resolvedAgentPolicy.selection?.outcome === "selected"
      ? request.resolvedAgentPolicy.selection.profile.runtime
      : null)
  );
}

function supportsSimulatedRuntime(
  runtimeId: RuntimeId,
  request: RuntimeRequest,
): boolean {
  return (
    request.resolvedAgentPolicy.status === "resolved" &&
    selectedRuntime(request) === runtimeId &&
    (request.allowedProviders === undefined ||
      request.allowedProviders.includes(request.provider)) &&
    (request.allowedRuntimes === undefined ||
      request.allowedRuntimes.includes(runtimeId))
  );
}

function failure(
  code: RuntimeErrorCode,
  details: RuntimeMetadata,
): RuntimeExecutionError {
  return {
    code,
    message: "Simulated runtime returned its configured failure.",
    details,
    processStarted: false,
  };
}

/**
 * Creates a local deterministic RuntimeAdapter for architecture validation.
 * It is not a provider, model, transport, or test mock, and has no external
 * effects. Configuration is captured as JSON data only.
 */
export function createSimulatedRuntimeAdapter(
  options: SimulatedRuntimeAdapterOptions,
): RuntimeAdapter {
  const output = cloneOutput(options.output);
  const runtimeId = options.runtimeId;
  const outcome = options.outcome;
  const errorCode = options.errorCode ?? "runtime_disabled";

  return {
    runtimeId,
    capabilities: [],
    supports: (request) => supportsSimulatedRuntime(runtimeId, request),
    execute: (request): RuntimeResult =>
      outcome === "success"
        ? {
            runtimeId,
            status: "completed",
            startedAt: request.requestedAt,
            completedAt: request.requestedAt,
            diagnostics: ["Simulated runtime completed deterministically."],
            output: cloneOutput(output as SimulatedRuntimeOutput),
            metadata: request.metadata,
          }
        : {
            runtimeId,
            status: "denied",
            startedAt: request.requestedAt,
            completedAt: request.requestedAt,
            diagnostics: ["Simulated runtime returned a deterministic failure."],
            output: null,
            metadata: request.metadata,
            error: failure(errorCode, { outcome: "failure" }),
          },
  };
}

/** Static neutral runtime used only to validate the V13 -> V10 execution path. */
export const SimulatedRuntime = createSimulatedRuntimeAdapter({
  runtimeId: "custom",
  outcome: "success",
  output: { kind: "simulated-runtime-result" },
});
