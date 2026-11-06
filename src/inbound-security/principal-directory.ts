/**
 * Inbound principal directory (L7.2 / E2a). PURE and NOT WIRED.
 *
 * Loop Engine resolves a principal's tenant and roles from ITS OWN
 * configuration, keyed by an opaque `principalId`. Nothing the caller sends
 * (assertion, role, tenant, right) is ever an input of the resolution: the
 * only input is the identifier, and anything not declared here is unknown.
 *
 * Deliberately NOT decided here (proposal P9-2, not accepted): how a
 * `principalId` is derived from `issuer + subject`. It is treated as an opaque,
 * canonical string (E5 rule: non-empty, no surrounding whitespace, no control
 * character) compared EXACTLY: no case folding, no trimming, no aliasing.
 *
 * No I/O, no environment, no authentication: this module creates no account
 * and grants no right by itself (rights stay in the ACL and the service ceiling).
 *
 * WIRING NOTE: the existing API-key verifier accepts any `trim().length > 0`
 * string for principal id, type, tenant and roles, whereas this directory
 * requires the canonical rule. A principal declared there with surrounding
 * whitespace is therefore UNKNOWN here (closed by default). Align the two, or
 * document the asymmetry, before any wiring.
 */

import { isCanonicalInput } from "../core/canonical-input.js";
import type { InboundPrincipal } from "./types.js";

export const INBOUND_PRINCIPAL_DIRECTORY_DENY_REASONS = [
  "principal_directory_invalid",
  "principal_id_invalid",
  "principal_unknown",
] as const;

export type InboundPrincipalDirectoryDenyReason =
  (typeof INBOUND_PRINCIPAL_DIRECTORY_DENY_REASONS)[number];

export type InboundPrincipalResolution =
  | Readonly<{ resolved: true; principal: InboundPrincipal }>
  | Readonly<{
      resolved: false;
      reason: InboundPrincipalDirectoryDenyReason;
    }>;

/** Port consumed by future identity lots; `null` means "not a known principal". */
export type InboundPrincipalDirectory = Readonly<{
  resolve(principalId: string): InboundPrincipal | null;
}>;

const ENTRY_KEYS = [
  "principalId",
  "principalType",
  "tenantId",
  "roles",
] as const;

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

function dataValue(
  descriptors: Readonly<Record<PropertyKey, PropertyDescriptor>>,
  key: string,
): { ok: true; value: unknown } | { ok: false } {
  const descriptor = descriptors[key];
  if (
    descriptor === undefined ||
    descriptor.enumerable !== true ||
    !Object.hasOwn(descriptor, "value") ||
    Object.hasOwn(descriptor, "get") ||
    Object.hasOwn(descriptor, "set")
  ) {
    return { ok: false };
  }
  return { ok: true, value: descriptor.value };
}

/**
 * Copies a non-empty array of unique canonical strings. Sparse arrays, accessor
 * elements and duplicates are refused (`Array.prototype.every` would skip holes).
 */
function readRoleList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const copy: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !Object.hasOwn(descriptor, "value") ||
      !isCanonicalInput(descriptor.value)
    ) {
      return null;
    }
    copy.push(descriptor.value);
  }
  return new Set(copy).size === copy.length ? copy : null;
}

/** Reads one entry exactly once; returns a frozen copy or `null` if malformed. */
function readEntry(value: unknown): InboundPrincipal | null {
  if (!isOrdinaryObject(value)) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== ENTRY_KEYS.length ||
      !keys.every(
        (key) =>
          typeof key === "string" &&
          (ENTRY_KEYS as readonly string[]).includes(key),
      )
    ) {
      return null;
    }
    const principalId = dataValue(descriptors, "principalId");
    const principalType = dataValue(descriptors, "principalType");
    const tenantId = dataValue(descriptors, "tenantId");
    const roles = dataValue(descriptors, "roles");
    if (!principalId.ok || !principalType.ok || !tenantId.ok || !roles.ok) {
      return null;
    }
    const roleList = readRoleList(roles.value);
    if (
      !isCanonicalInput(principalId.value) ||
      !isCanonicalInput(principalType.value) ||
      !(tenantId.value === null || isCanonicalInput(tenantId.value)) ||
      roleList === null
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

/**
 * Validates and copies a directory configuration. Returns `null` when the
 * configuration is empty, malformed or AMBIGUOUS (a `principalId` declared more
 * than once is never "first wins").
 */
function readDirectory(
  entries: unknown,
): ReadonlyMap<string, InboundPrincipal> | null {
  try {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const directory = new Map<string, InboundPrincipal>();
    for (let index = 0; index < entries.length; index += 1) {
      const entry = readEntry(entries[index]);
      if (entry === null || directory.has(entry.principalId)) return null;
      directory.set(entry.principalId, entry);
    }
    return directory;
  } catch {
    return null;
  }
}

/**
 * Returns a plain boolean on purpose: it does NOT narrow the source, which may
 * be a Proxy or hold mutable arrays. Use `createConfiguredInboundPrincipalDirectory`,
 * which works on a validated, frozen copy.
 */
export function validateConfiguredInboundPrincipalDirectory(
  entries: unknown,
): boolean {
  return readDirectory(entries) !== null;
}

/** Pure resolution with a distinguishable denial reason (all of them deny). */
export function resolveConfiguredInboundPrincipal(
  entries: unknown,
  principalId: unknown,
): InboundPrincipalResolution {
  const directory = readDirectory(entries);
  if (directory === null) {
    return Object.freeze({
      resolved: false as const,
      reason: "principal_directory_invalid" as const,
    });
  }
  if (!isCanonicalInput(principalId)) {
    return Object.freeze({
      resolved: false as const,
      reason: "principal_id_invalid" as const,
    });
  }
  const principal = directory.get(principalId);
  if (principal === undefined) {
    return Object.freeze({
      resolved: false as const,
      reason: "principal_unknown" as const,
    });
  }
  return Object.freeze({ resolved: true as const, principal });
}

/**
 * Builds the port from a validated, defensively copied configuration. An
 * invalid or ambiguous configuration is refused at creation (never silently
 * ignored); later mutation of the caller's arrays has no effect.
 */
export function createConfiguredInboundPrincipalDirectory(
  entries: unknown,
): InboundPrincipalDirectory {
  const directory = readDirectory(entries);
  if (directory === null) {
    throw new TypeError(
      "Inbound principal directory configuration is invalid.",
    );
  }
  return Object.freeze({
    resolve(principalId: string): InboundPrincipal | null {
      if (!isCanonicalInput(principalId)) return null;
      return directory.get(principalId) ?? null;
    },
  });
}
