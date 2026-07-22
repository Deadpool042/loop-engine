import type { ProviderRequest } from "../types.js";
import type { RuntimeId } from "../../runtime/types.js";
import { OPENCLAW_OPERATION_REGISTRY } from "./protocol.js";
import type { OpenClawOperation, OpenClawRequest } from "./types.js";

export type NormalizeOpenClawRequestOptions = Readonly<{
  protocolVersion?: string;
  operation?: OpenClawOperation;
  correlationId?: string;
}>;

function selectedRuntime(request: ProviderRequest): RuntimeId {
  return (
    request.runtimeRequest.requestedRuntime ??
    (request.runtimeRequest.resolvedAgentPolicy.selection?.outcome ===
    "selected"
      ? request.runtimeRequest.resolvedAgentPolicy.selection.profile.runtime
      : "openclaw")
  );
}

/**
 * Purely derives a safe protocol envelope from existing normalized Provider
 * data. It copies no context-file content, task text, parent environment, or
 * arbitrary metadata values.
 */
export function normalizeOpenClawRequest(
  request: ProviderRequest,
  options: NormalizeOpenClawRequestOptions = {},
): OpenClawRequest {
  const context = request.runtimeRequest.contextPackage;
  const task = request.runtimeRequest.task;
  const operation =
    options.operation ?? OPENCLAW_OPERATION_REGISTRY[0]!.operation;
  const correlationId =
    options.correlationId ??
    (typeof request.metadata.requestId === "string"
      ? request.metadata.requestId
      : undefined);

  return Object.freeze({
    protocolVersion:
      options.protocolVersion ?? "loop-engine-openclaw-planning/v1",
    operation,
    providerId: "openclaw",
    provider: request.runtimeRequest.provider,
    runtimeId: selectedRuntime(request),
    input: Object.freeze({
      projectId: context.project,
      taskId: `${task.path}:${task.line}`,
      context: Object.freeze({
        projectId: context.project,
        fileCount: context.files.length,
        totalCharacters: context.totalCharacters,
        estimatedTokens: context.estimatedTokens,
        truncated: context.truncated,
      }),
    }),
    requiredProviderCapabilities: Object.freeze([
      ...request.requiredCapabilities,
    ]),
    requiredPermissions: Object.freeze([
      ...request.runtimeRequest.resolvedAgentPolicy.requirements
        .requiredPermissions,
    ]),
    requiredRuntimeCapabilities: Object.freeze([]),
    requiredTransportCapabilities: Object.freeze([]),
    metadata: Object.freeze({
      ...(correlationId === undefined ? {} : { correlationId }),
    }),
  });
}
