import { createHash, timingSafeEqual } from "node:crypto";

import type {
  InboundAuthenticationInput,
  InboundAuthenticationVerificationContext,
  InboundAuthenticationVerifier,
  InboundAuthenticationVerifierResult,
} from "./authentication-verification.js";
import type {
  InboundAuthenticationEvidence,
  InboundPrincipal,
} from "./types.js";

export const CONFIGURED_API_KEY_METHOD = "api-key-sha256" as const;

export type ConfiguredApiKeyCredentialRecord = Readonly<{
  credentialId: string;
  secretSha256: string;
  issuerId: string;
  subjectId: string;
  principal: InboundPrincipal;
  issuedAt: string;
  validFrom: string;
  expiresAt: string;
}>;

type ConfiguredApiKeyCredentialInput = Readonly<{
  credentialId: string;
  secret: string;
}>;

const UNKNOWN_CREDENTIAL_HASH = createHash("sha256")
  .update("loop-engine:configured-api-key:unknown:v1", "utf8")
  .digest("hex");

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

function isParseableInstant(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isUniqueNonEmptyStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

function isValidPrincipal(value: unknown): value is InboundPrincipal {
  if (!isOrdinaryObject(value)) return false;

  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return (
      hasExactKeys(descriptors, [
        "principalId",
        "principalType",
        "tenantId",
        "roles",
      ]) &&
      isEnumerableDataProperty(descriptors.principalId) &&
      isNonEmptyString(descriptors.principalId.value) &&
      isEnumerableDataProperty(descriptors.principalType) &&
      isNonEmptyString(descriptors.principalType.value) &&
      isEnumerableDataProperty(descriptors.tenantId) &&
      (descriptors.tenantId.value === null ||
        isNonEmptyString(descriptors.tenantId.value)) &&
      isEnumerableDataProperty(descriptors.roles) &&
      isUniqueNonEmptyStringArray(descriptors.roles.value)
    );
  } catch {
    return false;
  }
}

function isValidCredentialRecord(
  value: unknown,
): value is ConfiguredApiKeyCredentialRecord {
  if (!isOrdinaryObject(value)) return false;

  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expected = [
      "credentialId",
      "secretSha256",
      "issuerId",
      "subjectId",
      "principal",
      "issuedAt",
      "validFrom",
      "expiresAt",
    ] as const;
    if (
      !hasExactKeys(descriptors, expected) ||
      expected.some((key) => !isEnumerableDataProperty(descriptors[key])) ||
      !isNonEmptyString(descriptors.credentialId!.value) ||
      !isSha256(descriptors.secretSha256!.value) ||
      !isNonEmptyString(descriptors.issuerId!.value) ||
      !isNonEmptyString(descriptors.subjectId!.value) ||
      !isValidPrincipal(descriptors.principal!.value) ||
      !isParseableInstant(descriptors.issuedAt!.value) ||
      !isParseableInstant(descriptors.validFrom!.value) ||
      !isParseableInstant(descriptors.expiresAt!.value)
    ) {
      return false;
    }

    const principalDescriptors = Object.getOwnPropertyDescriptors(
      descriptors.principal!.value as InboundPrincipal,
    );
    const subjectId = descriptors.subjectId!.value as string;
    const principalId = principalDescriptors.principalId?.value;
    const issuedAt = descriptors.issuedAt!.value as string;
    const validFrom = descriptors.validFrom!.value as string;
    const expiresAt = descriptors.expiresAt!.value as string;

    return (
      subjectId === principalId &&
      Date.parse(issuedAt) <= Date.parse(validFrom) &&
      Date.parse(validFrom) < Date.parse(expiresAt)
    );
  } catch {
    return false;
  }
}

function readCredential(value: unknown): ConfiguredApiKeyCredentialInput | null {
  if (!isOrdinaryObject(value)) return null;

  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      !hasExactKeys(descriptors, ["credentialId", "secret"]) ||
      !isEnumerableDataProperty(descriptors.credentialId) ||
      !isNonEmptyString(descriptors.credentialId.value) ||
      !isEnumerableDataProperty(descriptors.secret) ||
      !isNonEmptyString(descriptors.secret.value)
    ) {
      return null;
    }
    return Object.freeze({
      credentialId: descriptors.credentialId.value,
      secret: descriptors.secret.value,
    });
  } catch {
    return null;
  }
}

function hashesMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export function hashConfiguredApiKeySecret(secret: string): string {
  if (!isNonEmptyString(secret)) {
    throw new TypeError("Configured API key secret must be a non-empty string.");
  }
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function deriveConfiguredApiKeyEvidenceId(
  record: ConfiguredApiKeyCredentialRecord,
): string {
  return createHash("sha256")
    .update("loop-engine:configured-api-key-evidence:v1\0", "utf8")
    .update(record.credentialId, "utf8")
    .update("\0", "utf8")
    .update(record.issuerId, "utf8")
    .update("\0", "utf8")
    .update(record.subjectId, "utf8")
    .update("\0", "utf8")
    .update(record.secretSha256, "utf8")
    .digest("hex");
}

export function validateConfiguredApiKeyCredentialRecords(
  records: unknown,
): records is readonly ConfiguredApiKeyCredentialRecord[] {
  try {
    return (
      Array.isArray(records) &&
      records.length > 0 &&
      records.every(isValidCredentialRecord) &&
      new Set(records.map((record) => record.credentialId)).size === records.length
    );
  } catch {
    return false;
  }
}

export function createConfiguredApiKeyVerifier(
  records: readonly ConfiguredApiKeyCredentialRecord[],
): InboundAuthenticationVerifier {
  if (!validateConfiguredApiKeyCredentialRecords(records)) {
    throw new TypeError("Configured API key credential records are invalid.");
  }

  const registry = new Map(records.map((record) => [record.credentialId, record]));

  return Object.freeze({
    verify(
      input: InboundAuthenticationInput,
      _context: InboundAuthenticationVerificationContext,
    ): InboundAuthenticationVerifierResult {
      if (input.method !== CONFIGURED_API_KEY_METHOD) {
        return Object.freeze({ verified: false as const, reason: "rejected" as const });
      }

      const credential = readCredential(input.credential);
      if (credential === null) {
        return Object.freeze({ verified: false as const, reason: "invalid" as const });
      }

      const record = registry.get(credential.credentialId);
      const actualHash = hashConfiguredApiKeySecret(credential.secret);
      const expectedHash = record?.secretSha256 ?? UNKNOWN_CREDENTIAL_HASH;
      const matched = hashesMatch(actualHash, expectedHash);
      if (record === undefined || !matched) {
        return Object.freeze({ verified: false as const, reason: "rejected" as const });
      }

      const evidence: InboundAuthenticationEvidence = Object.freeze({
        evidenceId: deriveConfiguredApiKeyEvidenceId(record),
        method: CONFIGURED_API_KEY_METHOD,
        subjectId: record.subjectId,
        issuerId: record.issuerId,
        credentialFingerprint: record.secretSha256,
        verified: true,
        issuedAt: record.issuedAt,
        validFrom: record.validFrom,
        expiresAt: record.expiresAt,
        metadata: Object.freeze({ credentialId: record.credentialId }),
      });

      return Object.freeze({ verified: true as const, evidence });
    },
  });
}
