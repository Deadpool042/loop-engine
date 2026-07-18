import {
  createProviderError,
  createProviderResult,
  normalizeProviderResult,
  type ProviderExecutionPlan,
  type ProviderResult,
} from "../providers/index.js";
import type { RuntimeRequest } from "../runtime/types.js";
import {
  createTransportError,
  selectTransport,
  type TransportAdapter,
  type TransportError,
  type TransportExecutionPolicy,
  type TransportRequest,
  type TransportResolution,
  type TransportResult,
} from "../transports/index.js";

export type TransportRequestCreation =
  | Readonly<{ outcome: "created"; request: TransportRequest }>
  | Readonly<{ outcome: "rejected"; error: TransportError }>;

/**
 * Copies and freezes a serializable request snapshot so later caller mutation
 * cannot widen the authorization seen by a transport.
 */
function snapshot<T>(value: T): T {
  const copy = JSON.parse(JSON.stringify(value)) as T;
  const freeze = (entry: unknown): unknown => {
    if (entry === null || typeof entry !== "object") return entry;
    for (const child of Object.values(entry as Record<string, unknown>)) {
      freeze(child);
    }
    return Object.freeze(entry);
  };
  return freeze(copy) as T;
}

/**
 * Turns a ready provider plan into a structured transport request. All current
 * provider stubs are intentionally rejected here before transport selection.
 */
export function createTransportRequest(
  runtimeRequest: RuntimeRequest,
  providerPlan: ProviderExecutionPlan,
  transportPolicy: TransportExecutionPolicy,
): TransportRequestCreation {
  if (providerPlan.status !== "ready" || !providerPlan.transportIntent) {
    return {
      outcome: "rejected",
      error: createTransportError(
        "provider_plan_not_executable",
        "Provider plan does not declare an executable transport intent.",
      ),
    };
  }

  if (providerPlan.provider !== runtimeRequest.provider) {
    return {
      outcome: "rejected",
      error: createTransportError(
        "invalid_transport_request",
        "Provider plan does not match the normalized runtime request.",
      ),
    };
  }

  const intent = providerPlan.transportIntent;
  if (intent.transportId !== "local-process") {
    return {
      outcome: "rejected",
      error: createTransportError(
        "transport_not_found",
        `Transport ${intent.transportId} is not registered.`,
      ),
    };
  }

  return {
    outcome: "created",
    request: snapshot({
      transportId: "local-process" as const,
      providerId: providerPlan.providerId,
      provider: providerPlan.provider,
      runtimeId: providerPlan.runtimeId,
      requiredCapabilities: intent.requiredCapabilities,
      command: intent.command,
      localProcessPolicy: intent.executionPolicy,
      transportPolicy,
      runtimeRequest,
      metadata: { ...runtimeRequest.metadata, ...providerPlan.metadata },
    }),
  };
}

/** Resolves a transport without executing it. */
export function resolveTransport(
  request: TransportRequest,
): TransportResolution {
  const selection = selectTransport(request);
  return selection.outcome === "selected"
    ? { outcome: "resolved", adapter: selection.adapter, request }
    : selection;
}

/** The only Core API that invokes a selected transport adapter. */
export async function executeTransport(
  adapter: TransportAdapter,
  request: TransportRequest,
): Promise<TransportResult> {
  return await adapter.execute(request);
}

function providerTransportError(error: TransportError) {
  const code =
    error.code === "provider_plan_not_executable"
      ? "provider_plan_not_executable"
      : error.executionStarted
        ? "transport_execution_failed"
        : "transport_not_available";
  return createProviderError(
    code,
    error.message,
    { transportErrorCode: error.code },
    error.executionStarted,
  );
}

/** Converts safe normalized transport output back into the Provider contract. */
export function normalizeProviderTransportResult(
  providerPlan: ProviderExecutionPlan,
  result: TransportResult,
): ProviderResult {
  const status =
    result.status === "not_supported" ? "unsupported" : result.status;
  return normalizeProviderResult(
    providerPlan.providerId,
    providerPlan.runtimeId,
    {
      status,
      output: { stdout: result.stdout, stderr: result.stderr },
      diagnostics: result.diagnostics.map((message) => ({
        code: "transport",
        message,
        details: {},
      })),
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      metadata: result.metadata,
      ...(result.error === undefined
        ? {}
        : { error: providerTransportError(result.error) }),
      exitCode: result.exitCode,
      signal: result.signal,
    },
  );
}

/**
 * Explicit orchestration convenience for internal callers. Planning never
 * reaches this function; failed plan validation returns before transport use.
 */
export async function executeProviderPlan(
  runtimeRequest: RuntimeRequest,
  providerPlan: ProviderExecutionPlan,
  transportPolicy: TransportExecutionPolicy,
): Promise<ProviderResult> {
  const created = createTransportRequest(
    runtimeRequest,
    providerPlan,
    transportPolicy,
  );
  if (created.outcome === "rejected") {
    return createProviderResult(
      providerPlan.providerId,
      providerPlan.runtimeId,
      "rejected",
      providerPlan.metadata,
      providerTransportError(created.error),
    );
  }

  const resolution = resolveTransport(created.request);
  if (resolution.outcome === "rejected") {
    return createProviderResult(
      providerPlan.providerId,
      providerPlan.runtimeId,
      "rejected",
      providerPlan.metadata,
      providerTransportError(resolution.error),
    );
  }

  const result = await executeTransport(resolution.adapter, resolution.request);
  return normalizeProviderTransportResult(providerPlan, result);
}
