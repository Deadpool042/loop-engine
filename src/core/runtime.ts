import {
  createUnsupportedRuntimeResult,
  selectRuntime,
  type RuntimeRequest,
  type RuntimeExecution,
  type RuntimeResult,
  type RuntimeSelectionResult,
  type LocalProcessRuntimeRequest,
  type RuntimeId,
} from "../runtime/index.js";
import type { AgentProvider } from "../agents/types.js";
import type { LoopRunResult } from "../loop/types.js";

export {
  createSimulatedRuntimeAdapter,
  SimulatedRuntime,
  type SimulatedRuntimeAdapterOptions,
  type SimulatedRuntimeOutput,
} from "../runtime/simulated.js";

export type CreateRuntimeRequestOptions = Readonly<{
  requestedRuntime?: RuntimeId;
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly RuntimeId[];
  localProcess?: LocalProcessRuntimeRequest;
}>;

/**
 * Builds a runtime request only when the existing plan already produced its
 * candidate, policy forecast, and bounded context package. It does not alter
 * LoopRunResult or invoke a runtime.
 */
export function createRuntimeRequest(
  result: LoopRunResult,
  options: CreateRuntimeRequestOptions = {},
): RuntimeRequest | null {
  const { candidate, agentPolicy, contextPackage } = result;

  if (
    !candidate ||
    !agentPolicy ||
    !contextPackage ||
    agentPolicy.selection?.outcome !== "selected"
  ) {
    return null;
  }

  const profile = agentPolicy.selection.profile;
  return {
    task: candidate,
    mode: agentPolicy.mode,
    contextPackage,
    resolvedAgentPolicy: agentPolicy,
    provider: profile.provider,
    effort: profile.effort,
    requestedAt: result.completedAt ?? result.startedAt,
    metadata: { project: result.project, runId: result.runId },
    ...(options.requestedRuntime === undefined
      ? {}
      : { requestedRuntime: options.requestedRuntime }),
    ...(options.allowedProviders === undefined
      ? {}
      : { allowedProviders: options.allowedProviders }),
    ...(options.allowedRuntimes === undefined
      ? {}
      : { allowedRuntimes: options.allowedRuntimes }),
    ...(options.localProcess === undefined
      ? {}
      : { localProcess: options.localProcess }),
  };
}

/** Resolves a static RuntimeAdapter without executing it. */
export function resolveRuntime(
  request: RuntimeRequest,
): RuntimeSelectionResult {
  return selectRuntime(request);
}

/**
 * Invokes the selected adapter. V10 adapters are deterministic stubs, so this
 * function performs no real execution, I/O, process spawn, or network call.
 */
export function executeRuntime(request: RuntimeRequest): RuntimeExecution {
  const selection = resolveRuntime(request);
  return selection.outcome === "selected"
    ? selection.adapter.execute(request)
    : createUnsupportedRuntimeResult(request, selection.reason);
}
