import type { LoopRuntimePublicRequestReferenceCatalog } from "./loop-runtime-public-request-resolution.js";
import type {
  LoopRuntimeResolvedPolicyConfiguration,
  LoopRuntimeResolvedProfileConfiguration,
} from "./loop-runtime-public-request-configuration.js";
import type { LoopRuntimeInternalLimits } from "./loop-runtime-public-request-limits.js";
import type { LoopRuntimeRequestBinding } from "./loop-runtime-public-request-runtime-request.js";
import type { LoopRuntimePublicRequest } from "./loop-runtime-public-request.js";
import {
  createLoopRuntimePublicRequestAuthorizationRequest,
  type LoopRuntimeAuthenticatedPrincipal,
} from "./loop-runtime-public-request-authorization.js";

export type LoopRuntimeAuthorizedEngineAssemblyRequest = Readonly<{
  principalId: string;
  request: LoopRuntimePublicRequest;
}>;

export type LoopRuntimeAuthorizedEngineAssemblyRequestCreationResult =
  | Readonly<{
      created: true;
      assemblyRequest: LoopRuntimeAuthorizedEngineAssemblyRequest;
    }>
  | Readonly<{
      created: false;
      reason: "invalid_assembly_context";
    }>;

export type LoopRuntimeAuthorizedEngineAssembly = Readonly<{
  catalog: LoopRuntimePublicRequestReferenceCatalog<
    LoopRuntimeResolvedPolicyConfiguration,
    LoopRuntimeResolvedProfileConfiguration
  >;
  limits: LoopRuntimeInternalLimits;
  binding: LoopRuntimeRequestBinding;
}>;

export type LoopRuntimeAuthorizedEngineAssemblyFailureReason =
  | "assembly_unavailable"
  | "assembly_ambiguous"
  | "invalid_assembly";

export type LoopRuntimeAuthorizedEngineAssemblyResult =
  | Readonly<{
      assembled: true;
      assembly: LoopRuntimeAuthorizedEngineAssembly;
    }>
  | Readonly<{
      assembled: false;
      reason: LoopRuntimeAuthorizedEngineAssemblyFailureReason;
    }>;

export type LoopRuntimeAuthorizedEngineAssembler = Readonly<{
  assemble(
    request: LoopRuntimeAuthorizedEngineAssemblyRequest,
  ):
    | LoopRuntimeAuthorizedEngineAssemblyResult
    | Promise<LoopRuntimeAuthorizedEngineAssemblyResult>;
}>;

function invalidAssemblyContext():
  LoopRuntimeAuthorizedEngineAssemblyRequestCreationResult {
  return Object.freeze({
    created: false,
    reason: "invalid_assembly_context" as const,
  });
}

export function createLoopRuntimeAuthorizedEngineAssemblyRequest(
  principal: LoopRuntimeAuthenticatedPrincipal,
  request: LoopRuntimePublicRequest,
): LoopRuntimeAuthorizedEngineAssemblyRequestCreationResult {
  try {
    const authorizationRequest =
      createLoopRuntimePublicRequestAuthorizationRequest(principal, request);

    if (!authorizationRequest.created) {
      return invalidAssemblyContext();
    }

    return Object.freeze({
      created: true as const,
      assemblyRequest: Object.freeze({
        principalId: authorizationRequest.authorizationRequest.principalId,
        request,
      }),
    });
  } catch {
    return invalidAssemblyContext();
  }
}
