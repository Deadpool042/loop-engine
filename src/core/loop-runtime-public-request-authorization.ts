import {
  validateLoopRuntimePublicRequest,
  type LoopRuntimePublicRequest,
} from "./loop-runtime-public-request.js";

export type LoopRuntimeAuthenticatedPrincipal = Readonly<{
  principalId: string;
}>;

export type LoopRuntimePublicRequestAuthorizationRequest = Readonly<{
  principalId: string;
  project: string;
  policyRef: string;
  profileRef: string;
  mode: LoopRuntimePublicRequest["mode"];
}>;

export type LoopRuntimePublicRequestAuthorizationRequestCreationResult =
  | Readonly<{
      created: true;
      authorizationRequest: LoopRuntimePublicRequestAuthorizationRequest;
    }>
  | Readonly<{
      created: false;
      reason: "invalid_authorization_context";
    }>;

export type LoopRuntimePublicRequestAuthorizationDecision =
  | Readonly<{
      authorized: true;
    }>
  | Readonly<{
      authorized: false;
      reason: "not_authorized";
    }>;

export type LoopRuntimePublicRequestAuthorizer = Readonly<{
  authorize(
    request: LoopRuntimePublicRequestAuthorizationRequest,
  ):
    | LoopRuntimePublicRequestAuthorizationDecision
    | Promise<LoopRuntimePublicRequestAuthorizationDecision>;
}>;

type PrincipalInspection = Readonly<{
  keys: readonly PropertyKey[];
  descriptor: PropertyDescriptor | undefined;
}>;

function invalidAuthorizationContext():
  LoopRuntimePublicRequestAuthorizationRequestCreationResult {
  return Object.freeze({
    created: false,
    reason: "invalid_authorization_context" as const,
  });
}

function inspectPrincipal(
  principal: LoopRuntimeAuthenticatedPrincipal,
): PrincipalInspection | null {
  if (
    typeof principal !== "object" ||
    principal === null ||
    Array.isArray(principal) ||
    Object.getPrototypeOf(principal) !== Object.prototype
  ) {
    return null;
  }

  const keys = Reflect.ownKeys(principal);
  const descriptors = Object.getOwnPropertyDescriptors(principal);

  return {
    keys,
    descriptor: descriptors.principalId,
  };
}

function isValidPrincipalIdDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { value: string } {
  return (
    descriptor !== undefined &&
    descriptor.enumerable === true &&
    "value" in descriptor &&
    !("get" in descriptor) &&
    !("set" in descriptor) &&
    typeof descriptor.value === "string" &&
    descriptor.value.trim().length > 0
  );
}

function readPrincipalId(
  principal: LoopRuntimeAuthenticatedPrincipal,
): string | null {
  try {
    const inspection = inspectPrincipal(principal);

    if (inspection === null) {
      return null;
    }

    if (
      inspection.keys.length !== 1 ||
      inspection.keys[0] !== "principalId" ||
      !isValidPrincipalIdDescriptor(inspection.descriptor)
    ) {
      return null;
    }

    return inspection.descriptor.value;
  } catch {
    return null;
  }
}

export function createLoopRuntimePublicRequestAuthorizationRequest(
  principal: LoopRuntimeAuthenticatedPrincipal,
  request: LoopRuntimePublicRequest,
): LoopRuntimePublicRequestAuthorizationRequestCreationResult {
  const principalId = readPrincipalId(principal);

  if (principalId === null) {
    return invalidAuthorizationContext();
  }

  const validation = validateLoopRuntimePublicRequest(request);

  if (!validation.valid) {
    return invalidAuthorizationContext();
  }

  return Object.freeze({
    created: true as const,
    authorizationRequest: Object.freeze({
      principalId,
      project: request.project,
      policyRef: request.policyRef,
      profileRef: request.profileRef,
      mode: request.mode,
    }),
  });
}
