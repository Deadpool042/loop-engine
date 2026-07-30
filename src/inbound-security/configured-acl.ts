import type { LoopRuntimePublicRequest } from "../core/loop-runtime-public-request.js";
import type { InboundPrincipal } from "./types.js";

export const CONFIGURED_INBOUND_ACL_DENY_REASONS = [
  "principal_missing",
  "acl_configuration_invalid",
  "tenant_not_authorized",
  "role_not_authorized",
  "project_not_authorized",
  "operation_not_authorized",
] as const;

export type ConfiguredInboundAclDenyReason =
  (typeof CONFIGURED_INBOUND_ACL_DENY_REASONS)[number];

export type ConfiguredInboundAclRule = Readonly<{
  ruleId: string;
  tenantId: string | null;
  requiredRoles: readonly string[];
  projects: readonly string[];
  operations: readonly LoopRuntimePublicRequest["mode"][];
}>;

export type ConfiguredInboundAclDecision =
  | Readonly<{
      allowed: true;
      ruleId: string;
    }>
  | Readonly<{
      allowed: false;
      reason: ConfiguredInboundAclDenyReason;
    }>;

function isOrdinaryObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function isEnumerableDataProperty(
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

function hasExactKeys(
  descriptors: Readonly<Record<PropertyKey, PropertyDescriptor>>,
  expected: readonly string[],
): boolean {
  const keys = Reflect.ownKeys(descriptors);
  return (
    keys.length === expected.length &&
    expected.every((key) => keys.includes(key)) &&
    keys.every((key) => typeof key === "string" && expected.includes(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUniqueNonEmptyStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

function isOperationArray(
  value: unknown,
): value is readonly LoopRuntimePublicRequest["mode"][] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((operation) => operation === "dry-run" || operation === "execute") &&
    new Set(value).size === value.length
  );
}

function isValidRule(value: unknown): value is ConfiguredInboundAclRule {
  if (!isOrdinaryObject(value)) return false;

  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expected = [
      "ruleId",
      "tenantId",
      "requiredRoles",
      "projects",
      "operations",
    ] as const;

    return (
      hasExactKeys(descriptors, expected) &&
      expected.every((key) => isEnumerableDataProperty(descriptors[key])) &&
      isNonEmptyString(descriptors.ruleId!.value) &&
      (descriptors.tenantId!.value === null ||
        isNonEmptyString(descriptors.tenantId!.value)) &&
      isUniqueNonEmptyStringArray(descriptors.requiredRoles!.value) &&
      isUniqueNonEmptyStringArray(descriptors.projects!.value) &&
      isOperationArray(descriptors.operations!.value)
    );
  } catch {
    return false;
  }
}

export function validateConfiguredInboundAclRules(
  rules: unknown,
): rules is readonly ConfiguredInboundAclRule[] {
  try {
    return (
      Array.isArray(rules) &&
      rules.length > 0 &&
      rules.every(isValidRule) &&
      new Set(rules.map((rule) => rule.ruleId)).size === rules.length
    );
  } catch {
    return false;
  }
}

function denied(reason: ConfiguredInboundAclDenyReason): ConfiguredInboundAclDecision {
  return Object.freeze({ allowed: false as const, reason });
}

export function evaluateConfiguredInboundAcl(input: Readonly<{
  principal: InboundPrincipal | null;
  project: string;
  operation: LoopRuntimePublicRequest["mode"];
  rules: readonly ConfiguredInboundAclRule[];
}>): ConfiguredInboundAclDecision {
  if (!validateConfiguredInboundAclRules(input.rules)) {
    return denied("acl_configuration_invalid");
  }
  if (input.principal === null) {
    return denied("principal_missing");
  }

  const tenantRules = input.rules.filter(
    (rule) => rule.tenantId === input.principal?.tenantId,
  );
  if (tenantRules.length === 0) {
    return denied("tenant_not_authorized");
  }

  const principalRoles = new Set(input.principal.roles);
  const roleRules = tenantRules.filter((rule) =>
    rule.requiredRoles.every((role) => principalRoles.has(role)),
  );
  if (roleRules.length === 0) {
    return denied("role_not_authorized");
  }

  const projectRules = roleRules.filter((rule) =>
    rule.projects.includes(input.project),
  );
  if (projectRules.length === 0) {
    return denied("project_not_authorized");
  }

  const rule = projectRules.find((candidate) =>
    candidate.operations.includes(input.operation),
  );
  if (rule === undefined) {
    return denied("operation_not_authorized");
  }

  return Object.freeze({ allowed: true as const, ruleId: rule.ruleId });
}
