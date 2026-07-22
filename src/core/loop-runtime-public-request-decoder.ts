import {
  validateLoopRuntimePublicRequest,
  type LoopRuntimePublicRequest,
  type LoopRuntimePublicRequestValidationFailureReason,
} from "./loop-runtime-public-request.js";

export type LoopRuntimePublicRequestDecodeFailureReason =
  | "invalid_input"
  | "invalid_request_object"
  | "invalid_request_property"
  | "missing_request_field"
  | "unexpected_request_field"
  | "invalid_budget_object"
  | "invalid_budget_property"
  | "missing_budget_field"
  | "unexpected_budget_field"
  | LoopRuntimePublicRequestValidationFailureReason;

export type LoopRuntimePublicRequestDecodeResult =
  | Readonly<{
      parsed: true;
      request: LoopRuntimePublicRequest;
    }>
  | Readonly<{
      parsed: false;
      reason: LoopRuntimePublicRequestDecodeFailureReason;
    }>;

const REQUIRED_REQUEST_FIELDS = [
  "schemaVersion",
  "project",
  "mode",
  "policyRef",
  "profileRef",
  "requestedMaxEffort",
  "budget",
] as const;

const OPTIONAL_REQUEST_FIELDS = ["cycleId"] as const;

const REQUEST_FIELDS = [
  ...REQUIRED_REQUEST_FIELDS,
  ...OPTIONAL_REQUEST_FIELDS,
] as const;

const REQUIRED_BUDGET_FIELDS = [
  "maxTokens",
  "maxCostUsd",
  "maxDurationMs",
  "maxCalls",
  "maxRepairs",
] as const;

type RequestField = (typeof REQUEST_FIELDS)[number];
type BudgetField = (typeof REQUIRED_BUDGET_FIELDS)[number];

type DescriptorMap = Record<PropertyKey, PropertyDescriptor>;

function failure(
  reason: LoopRuntimePublicRequestDecodeFailureReason,
): LoopRuntimePublicRequestDecodeResult {
  return Object.freeze({
    parsed: false,
    reason,
  });
}

function isOrdinaryObject(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function inspectObject(
  value: unknown,
): { keys: readonly PropertyKey[]; descriptors: DescriptorMap } | null {
  if (!isOrdinaryObject(value)) {
    return null;
  }

  return {
    keys: Reflect.ownKeys(value),
    descriptors: Object.getOwnPropertyDescriptors(value),
  };
}

function hasOnlyStringKeys(keys: readonly PropertyKey[]): boolean {
  return keys.every((key) => typeof key === "string");
}

function includesField<T extends string>(
  fields: readonly T[],
  key: string,
): key is T {
  return fields.includes(key as T);
}

function isReadableDataProperty(
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

function validateKeys(
  keys: readonly PropertyKey[],
  requiredFields: readonly string[],
  allowedFields: readonly string[],
  missingReason:
    | "missing_request_field"
    | "missing_budget_field",
  unexpectedReason:
    | "unexpected_request_field"
    | "unexpected_budget_field",
): LoopRuntimePublicRequestDecodeFailureReason | null {
  if (!hasOnlyStringKeys(keys)) {
    return unexpectedReason;
  }

  for (const key of keys) {
    if (typeof key !== "string" || !allowedFields.includes(key)) {
      return unexpectedReason;
    }
  }

  for (const field of requiredFields) {
    if (!keys.includes(field)) {
      return missingReason;
    }
  }

  return null;
}

function getDataValue(
  descriptors: DescriptorMap,
  field: string,
  invalidReason:
    | "invalid_request_property"
    | "invalid_budget_property",
):
  | { ok: true; value: unknown }
  | { ok: false; reason: LoopRuntimePublicRequestDecodeFailureReason } {
  const descriptor = descriptors[field];

  if (!isReadableDataProperty(descriptor)) {
    return {
      ok: false,
      reason: invalidReason,
    };
  }

  return {
    ok: true,
    value: descriptor.value,
  };
}

export function decodeLoopRuntimePublicRequest(
  input: unknown,
): LoopRuntimePublicRequestDecodeResult {
  try {
    const inspectedRequest = inspectObject(input);

    if (inspectedRequest === null) {
      return failure("invalid_request_object");
    }

    const requestKeyFailure = validateKeys(
      inspectedRequest.keys,
      REQUIRED_REQUEST_FIELDS,
      REQUEST_FIELDS,
      "missing_request_field",
      "unexpected_request_field",
    );

    if (requestKeyFailure !== null) {
      return failure(requestKeyFailure);
    }

    const requestValues: Partial<Record<RequestField, unknown>> = {};

    for (const key of inspectedRequest.keys) {
      if (!includesField(REQUEST_FIELDS, key as string)) {
        return failure("unexpected_request_field");
      }

      const value = getDataValue(
        inspectedRequest.descriptors,
        key as string,
        "invalid_request_property",
      );

      if (!value.ok) {
        return failure(value.reason);
      }

      requestValues[key as RequestField] = value.value;
    }

    const inspectedBudget = inspectObject(requestValues.budget);

    if (inspectedBudget === null) {
      return failure("invalid_budget_object");
    }

    const budgetKeyFailure = validateKeys(
      inspectedBudget.keys,
      REQUIRED_BUDGET_FIELDS,
      REQUIRED_BUDGET_FIELDS,
      "missing_budget_field",
      "unexpected_budget_field",
    );

    if (budgetKeyFailure !== null) {
      return failure(budgetKeyFailure);
    }

    const budgetValues: Partial<Record<BudgetField, unknown>> = {};

    for (const key of inspectedBudget.keys) {
      if (!includesField(REQUIRED_BUDGET_FIELDS, key as string)) {
        return failure("unexpected_budget_field");
      }

      const value = getDataValue(
        inspectedBudget.descriptors,
        key as string,
        "invalid_budget_property",
      );

      if (!value.ok) {
        return failure(value.reason);
      }

      budgetValues[key as BudgetField] = value.value;
    }

    const budget = Object.freeze({
      maxTokens: budgetValues.maxTokens,
      maxCostUsd: budgetValues.maxCostUsd,
      maxDurationMs: budgetValues.maxDurationMs,
      maxCalls: budgetValues.maxCalls,
      maxRepairs: budgetValues.maxRepairs,
    }) as LoopRuntimePublicRequest["budget"];

    const request = Object.freeze({
      schemaVersion: requestValues.schemaVersion,
      project: requestValues.project,
      ...(requestValues.cycleId === undefined
        ? {}
        : { cycleId: requestValues.cycleId }),
      mode: requestValues.mode,
      policyRef: requestValues.policyRef,
      profileRef: requestValues.profileRef,
      requestedMaxEffort: requestValues.requestedMaxEffort,
      budget,
    }) as LoopRuntimePublicRequest;

    const validation = validateLoopRuntimePublicRequest(request);

    if (!validation.valid) {
      return failure(validation.reason);
    }

    return Object.freeze({
      parsed: true as const,
      request,
    });
  } catch {
    return failure("invalid_input");
  }
}
