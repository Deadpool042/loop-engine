/**
 * Effective authorization (L7.2 / E2b): rights of the principal ∩ service ceiling.
 * PURE and NOT WIRED (no gateway, adapter or Core consumes it).
 *
 * The principal is resolved by Loop Engine from ITS directory using only the
 * `principalId`; no role, tenant or right supplied by the caller is an input.
 * Both the principal's ACL and the service ceiling must allow the exact
 * (principal, project, operation) triple; the first denial wins and carries its
 * source. There is no default allow and no fallback to the other side.
 */

import { isCanonicalInput } from "../core/canonical-input.js";
import { evaluateConfiguredInboundAcl } from "./configured-acl.js";
import type {
  ConfiguredInboundAclDenyReason,
  ConfiguredInboundAclRule,
} from "./configured-acl.js";
import type { InboundOperation } from "./inbound-operation.js";
import type { InboundPrincipal } from "./types.js";
import type { InboundPrincipalDirectory } from "./principal-directory.js";
import { evaluateServiceCeiling } from "./service-ceiling.js";
import type { InboundServiceCeilingDenyReason } from "./service-ceiling.js";

export type InboundEffectiveAuthorizationDecision =
  | Readonly<{
      allowed: true;
      principalId: string;
      keyId: string;
      ruleId: string;
    }>
  | Readonly<{
      allowed: false;
      source: "principal_directory";
      reason: "principal_unknown";
    }>
  | Readonly<{
      allowed: false;
      source: "principal_acl";
      reason: ConfiguredInboundAclDenyReason;
    }>
  | Readonly<{
      allowed: false;
      source: "service_ceiling";
      reason: InboundServiceCeilingDenyReason;
    }>;

function dataValue(
  object: object,
  key: string,
): { ok: true; value: unknown } | { ok: false } {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor !== undefined && Object.hasOwn(descriptor, "value")
    ? { ok: true, value: descriptor.value }
    : { ok: false };
}

/** Copies an array element by element through data descriptors (no holes, no accessors). */
function copyArray(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  const copy: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const element = dataValue(value, String(index));
    if (!element.ok) return null;
    copy.push(element.value);
  }
  return copy;
}

/**
 * Takes ONE frozen snapshot of the ACL rules so that validation and evaluation
 * see the same data (the ACL reads its rules several times). Anything that is
 * not an ordinary, fully data-described rule list yields `null` (denied).
 */
function snapshotAclRules(
  rules: unknown,
): readonly ConfiguredInboundAclRule[] | null {
  try {
    const list = copyArray(rules);
    if (list === null) return null;
    const snapshot: ConfiguredInboundAclRule[] = [];
    for (const rule of list) {
      if (typeof rule !== "object" || rule === null || Array.isArray(rule))
        return null;
      if (Object.getPrototypeOf(rule) !== Object.prototype) return null;
      const keys = Reflect.ownKeys(rule);
      if (keys.some((key) => typeof key !== "string")) return null;
      const copied: Record<string, unknown> = {};
      for (const key of keys as string[]) {
        const entry = dataValue(rule, key);
        if (!entry.ok) return null;
        copied[key] = Array.isArray(entry.value)
          ? copyArray(entry.value)
          : entry.value;
        if (Array.isArray(entry.value) && copied[key] === null) return null;
      }
      snapshot.push(
        Object.freeze(copied) as unknown as ConfiguredInboundAclRule,
      );
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

/** Reads the principal returned by the port ONCE into a frozen copy. */
function snapshotPrincipal(value: unknown): InboundPrincipal | null {
  try {
    if (typeof value !== "object" || value === null) return null;
    const principalId = dataValue(value, "principalId");
    const principalType = dataValue(value, "principalType");
    const tenantId = dataValue(value, "tenantId");
    const roles = dataValue(value, "roles");
    if (!principalId.ok || !principalType.ok || !tenantId.ok || !roles.ok)
      return null;
    const roleList = copyArray(roles.value);
    if (
      roleList === null ||
      typeof principalId.value !== "string" ||
      typeof principalType.value !== "string" ||
      !(tenantId.value === null || typeof tenantId.value === "string") ||
      !roleList.every((role): role is string => typeof role === "string")
    ) {
      return null;
    }
    return Object.freeze({
      principalId: principalId.value,
      principalType: principalType.value,
      tenantId: tenantId.value,
      roles: Object.freeze(roleList),
    });
  } catch {
    return null;
  }
}

const UNKNOWN_PRINCIPAL = Object.freeze({
  allowed: false as const,
  source: "principal_directory" as const,
  reason: "principal_unknown" as const,
});

export function evaluateEffectiveInboundAuthorization(
  input: Readonly<{
    directory: InboundPrincipalDirectory;
    principalId: string;
    keyId: string;
    project: string;
    operation: InboundOperation;
    aclRules: unknown;
    ceilingRules: unknown;
  }>,
): InboundEffectiveAuthorizationDecision {
  if (!isCanonicalInput(input.principalId)) return UNKNOWN_PRINCIPAL;
  let resolved: unknown;
  try {
    resolved = input.directory.resolve(input.principalId);
  } catch {
    return UNKNOWN_PRINCIPAL;
  }
  const principal = snapshotPrincipal(resolved);
  // A port that answers for another identifier is treated as unknown.
  if (principal === null || principal.principalId !== input.principalId) {
    return UNKNOWN_PRINCIPAL;
  }

  const aclRules = snapshotAclRules(input.aclRules);
  const acl =
    aclRules === null
      ? ({ allowed: false, reason: "acl_configuration_invalid" } as const)
      : evaluateConfiguredInboundAcl({
          principal,
          project: input.project,
          operation: input.operation,
          rules: aclRules,
        });
  if (!acl.allowed) {
    return Object.freeze({
      allowed: false as const,
      source: "principal_acl" as const,
      reason: acl.reason,
    });
  }

  const ceiling = evaluateServiceCeiling({
    keyId: input.keyId,
    project: input.project,
    operation: input.operation,
    rules: input.ceilingRules,
  });
  if (!ceiling.allowed) {
    return Object.freeze({
      allowed: false as const,
      source: "service_ceiling" as const,
      reason: ceiling.reason,
    });
  }

  return Object.freeze({
    allowed: true as const,
    principalId: principal.principalId,
    keyId: ceiling.keyId,
    ruleId: acl.ruleId,
  });
}
