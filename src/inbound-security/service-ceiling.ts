/**
 * Service ceiling (L7.2 / E2b). PURE and NOT WIRED.
 *
 * A ceiling RESTRICTS what a calling service (identified by its key id) may ever
 * ask on behalf of a principal: explicit projects and operations, no wildcard,
 * empty by default. It never grants a right by itself; the effective right is
 * the INTERSECTION of the principal's rights and the ceiling (see
 * `effective-authorization.ts`). Anything absent, unknown or ambiguous denies.
 *
 * Deliberately NOT decided here (open, not accepted): the format of the service
 * key identifier. It is treated as an opaque canonical string (E5 rule),
 * compared exactly. Projects follow the registry name rule (E6), which also
 * makes a wildcard such as `*` an invalid configuration.
 */

import {
  isCanonicalInput,
  isCanonicalProject,
} from "../core/canonical-input.js";
import {
  isInboundOperation,
  type InboundOperation,
} from "./inbound-operation.js";

export const INBOUND_SERVICE_CEILING_DENY_REASONS = [
  "ceiling_configuration_invalid",
  "service_unknown",
  "service_project_not_authorized",
  "service_operation_not_authorized",
] as const;

export type InboundServiceCeilingDenyReason =
  (typeof INBOUND_SERVICE_CEILING_DENY_REASONS)[number];

export type InboundServiceCeilingRule = Readonly<{
  keyId: string;
  projects: readonly string[];
  operations: readonly InboundOperation[];
}>;

export type InboundServiceCeilingDecision =
  | Readonly<{ allowed: true; keyId: string }>
  | Readonly<{ allowed: false; reason: InboundServiceCeilingDenyReason }>;

const RULE_KEYS = ["keyId", "projects", "operations"] as const;

function isOrdinaryObject(
  value: unknown,
): value is Record<PropertyKey, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

/**
 * Copies an array of unique accepted items. Sparse arrays, accessor elements
 * and duplicates are refused. An EMPTY array is valid: it is an explicit "none".
 */
function readUniqueList<T extends string>(
  value: unknown,
  accept: (item: unknown) => item is T,
): readonly T[] | null {
  if (!Array.isArray(value)) return null;
  const copy: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !Object.hasOwn(descriptor, "value") ||
      !accept(descriptor.value)
    ) {
      return null;
    }
    copy.push(descriptor.value);
  }
  return new Set(copy).size === copy.length ? Object.freeze(copy) : null;
}

function readRule(value: unknown): InboundServiceCeilingRule | null {
  if (!isOrdinaryObject(value)) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== RULE_KEYS.length ||
      !keys.every(
        (key) =>
          typeof key === "string" &&
          (RULE_KEYS as readonly string[]).includes(key),
      )
    ) {
      return null;
    }
    const data = (
      key: string,
    ): { ok: true; value: unknown } | { ok: false } => {
      const descriptor = descriptors[key];
      return descriptor !== undefined &&
        descriptor.enumerable === true &&
        Object.hasOwn(descriptor, "value")
        ? { ok: true, value: descriptor.value }
        : { ok: false };
    };
    const keyId = data("keyId");
    const projects = data("projects");
    const operations = data("operations");
    if (!keyId.ok || !projects.ok || !operations.ok) return null;
    const projectList = readUniqueList(projects.value, isCanonicalProject);
    const operationList = readUniqueList(operations.value, isInboundOperation);
    if (
      !isCanonicalInput(keyId.value) ||
      projectList === null ||
      operationList === null
    ) {
      return null;
    }
    return Object.freeze({
      keyId: keyId.value,
      projects: projectList,
      operations: operationList,
    });
  } catch {
    return null;
  }
}

/** An empty list is VALID and means "no service may do anything". */
function readCeiling(
  rules: unknown,
): ReadonlyMap<string, InboundServiceCeilingRule> | null {
  try {
    if (!Array.isArray(rules)) return null;
    const ceiling = new Map<string, InboundServiceCeilingRule>();
    for (let index = 0; index < rules.length; index += 1) {
      const rule = readRule(rules[index]);
      // A keyId declared twice is ambiguous: never "first rule wins".
      if (rule === null || ceiling.has(rule.keyId)) return null;
      ceiling.set(rule.keyId, rule);
    }
    return ceiling;
  } catch {
    return null;
  }
}

export function validateInboundServiceCeilingRules(
  rules: unknown,
): rules is readonly InboundServiceCeilingRule[] {
  return readCeiling(rules) !== null;
}

function denied(
  reason: InboundServiceCeilingDenyReason,
): InboundServiceCeilingDecision {
  return Object.freeze({ allowed: false as const, reason });
}

export function evaluateServiceCeiling(
  input: Readonly<{
    keyId: unknown;
    project: unknown;
    operation: unknown;
    rules: unknown;
  }>,
): InboundServiceCeilingDecision {
  const ceiling = readCeiling(input.rules);
  if (ceiling === null) return denied("ceiling_configuration_invalid");

  const rule = isCanonicalInput(input.keyId)
    ? ceiling.get(input.keyId)
    : undefined;
  if (rule === undefined) return denied("service_unknown");

  if (
    !isCanonicalProject(input.project) ||
    !rule.projects.includes(input.project)
  ) {
    return denied("service_project_not_authorized");
  }
  if (
    !isInboundOperation(input.operation) ||
    !rule.operations.includes(input.operation)
  ) {
    return denied("service_operation_not_authorized");
  }
  return Object.freeze({ allowed: true as const, keyId: rule.keyId });
}
