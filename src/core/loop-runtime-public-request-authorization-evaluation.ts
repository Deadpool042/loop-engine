import type {
  LoopRuntimePublicRequestAuthorizationDecision,
  LoopRuntimePublicRequestAuthorizationRequest,
  LoopRuntimePublicRequestAuthorizer,
} from "./loop-runtime-public-request-authorization.js";

const AUTHORIZED_DECISION: LoopRuntimePublicRequestAuthorizationDecision =
  Object.freeze({
    authorized: true,
  });

const NOT_AUTHORIZED_DECISION: LoopRuntimePublicRequestAuthorizationDecision =
  Object.freeze({
    authorized: false,
    reason: "not_authorized",
  });

const AUTHORIZATION_REQUEST_FIELDS = [
  "principalId",
  "project",
  "policyRef",
  "profileRef",
  "mode",
] as const;

type AuthorizationRequestField =
  (typeof AUTHORIZATION_REQUEST_FIELDS)[number];

function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isDataProperty(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { value: unknown } {
  return (
    descriptor !== undefined &&
    descriptor.enumerable === true &&
    "value" in descriptor &&
    !("get" in descriptor) &&
    !("set" in descriptor)
  );
}

function hasExactStringKeys(
  keys: readonly PropertyKey[],
  expectedKeys: readonly string[],
): boolean {
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => typeof key === "string") &&
    expectedKeys.every((field) => keys.includes(field))
  );
}

function hasNonEmptyStringValue(
  descriptors: Record<PropertyKey, PropertyDescriptor>,
  field: AuthorizationRequestField,
): boolean {
  const descriptor = descriptors[field];

  return (
    isDataProperty(descriptor) &&
    typeof descriptor.value === "string" &&
    descriptor.value.trim().length > 0
  );
}

function isValidAuthorizationRequest(
  request: LoopRuntimePublicRequestAuthorizationRequest,
): request is LoopRuntimePublicRequestAuthorizationRequest {
  try {
    if (!isPlainObject(request)) {
      return false;
    }

    const keys = Reflect.ownKeys(request);
    if (!hasExactStringKeys(keys, AUTHORIZATION_REQUEST_FIELDS)) {
      return false;
    }

    const descriptors = Object.getOwnPropertyDescriptors(request);

    for (const field of AUTHORIZATION_REQUEST_FIELDS) {
      if (!hasNonEmptyStringValue(descriptors, field)) {
        return false;
      }
    }

    const mode = descriptors.mode?.value;
    return mode === "dry-run" || mode === "execute";
  } catch {
    return false;
  }
}

function readAuthorize(
  authorizer: LoopRuntimePublicRequestAuthorizer,
):
  | ((
      request: LoopRuntimePublicRequestAuthorizationRequest,
    ) =>
      | LoopRuntimePublicRequestAuthorizationDecision
      | Promise<LoopRuntimePublicRequestAuthorizationDecision>)
  | null {
  try {
    if (typeof authorizer !== "object" || authorizer === null) {
      return null;
    }

    const descriptor = Object.getOwnPropertyDescriptor(authorizer, "authorize");

    if (!isDataProperty(descriptor) || typeof descriptor.value !== "function") {
      return null;
    }

    return descriptor.value as (
      request: LoopRuntimePublicRequestAuthorizationRequest,
    ) =>
      | LoopRuntimePublicRequestAuthorizationDecision
      | Promise<LoopRuntimePublicRequestAuthorizationDecision>;
  } catch {
    return null;
  }
}

function isValidAllowedDecision(
  descriptors: Record<PropertyKey, PropertyDescriptor>,
): boolean {
  return (
    isDataProperty(descriptors.authorized) &&
    descriptors.authorized.value === true
  );
}

function isValidDeniedDecision(
  descriptors: Record<PropertyKey, PropertyDescriptor>,
): boolean {
  return (
    isDataProperty(descriptors.authorized) &&
    descriptors.authorized.value === false &&
    isDataProperty(descriptors.reason) &&
    descriptors.reason.value === "not_authorized"
  );
}

function normalizeDecision(
  decision: unknown,
): LoopRuntimePublicRequestAuthorizationDecision {
  try {
    if (!isPlainObject(decision)) {
      return NOT_AUTHORIZED_DECISION;
    }

    const keys = Reflect.ownKeys(decision);
    if (hasExactStringKeys(keys, ["authorized"])) {
      const descriptors = Object.getOwnPropertyDescriptors(decision);
      return isValidAllowedDecision(descriptors)
        ? AUTHORIZED_DECISION
        : NOT_AUTHORIZED_DECISION;
    }

    if (hasExactStringKeys(keys, ["authorized", "reason"])) {
      const descriptors = Object.getOwnPropertyDescriptors(decision);
      return isValidDeniedDecision(descriptors)
        ? NOT_AUTHORIZED_DECISION
        : NOT_AUTHORIZED_DECISION;
    }

    return NOT_AUTHORIZED_DECISION;
  } catch {
    return NOT_AUTHORIZED_DECISION;
  }
}

export async function evaluateLoopRuntimePublicRequestAuthorization(
  request: LoopRuntimePublicRequestAuthorizationRequest,
  authorizer: LoopRuntimePublicRequestAuthorizer,
): Promise<LoopRuntimePublicRequestAuthorizationDecision> {
  if (!isValidAuthorizationRequest(request)) {
    return NOT_AUTHORIZED_DECISION;
  }

  const authorize = readAuthorize(authorizer);
  if (authorize === null) {
    return NOT_AUTHORIZED_DECISION;
  }

  try {
    const decision = await authorize.call(authorizer, request);
    return normalizeDecision(decision);
  } catch {
    return NOT_AUTHORIZED_DECISION;
  }
}
