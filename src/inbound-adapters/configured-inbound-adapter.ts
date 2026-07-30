import { createHash } from "node:crypto";

import {
  executePreparedInboundRuntimeRequest,
  PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
  type PreparedInboundRuntimeExecutionDependencies,
  type PreparedInboundRuntimeExecutionResult,
  type PreparedInboundRuntimeResolver,
} from "../core/prepared-inbound-runtime-execution.js";
import type { InboundLoopRuntimeRequestEnvelope } from "../core/inbound.js";
import type { LoopRuntimePublicRequest } from "../core/loop-runtime-public-request.js";
import {
  CONFIGURED_API_KEY_METHOD,
  createConfiguredApiKeyVerifier,
  deriveConfiguredApiKeyEvidenceId,
  validateConfiguredApiKeyCredentialRecords,
  type ConfiguredApiKeyCredentialRecord,
} from "../inbound-security/configured-api-key.js";
import {
  evaluateConfiguredInboundAcl,
  validateConfiguredInboundAclRules,
  type ConfiguredInboundAclDenyReason,
  type ConfiguredInboundAclRule,
} from "../inbound-security/configured-acl.js";
import { createFileInboundReplayProtectionPort } from "../inbound-security/file-replay-protection.js";

export const CONFIGURED_INBOUND_ADAPTER_SCHEMA_VERSION = 1 as const;

export const CONFIGURED_INBOUND_ADAPTER_FAILURE_REASONS = [
  "malformed_request",
  "credential_configuration_invalid",
  "acl_configuration_invalid",
  "replay_configuration_invalid",
] as const;

export type ConfiguredInboundAdapterFailureReason =
  (typeof CONFIGURED_INBOUND_ADAPTER_FAILURE_REASONS)[number];

export type ConfiguredInboundAdapterRequest = Readonly<{
  requestId: string;
  evaluatedAt: string;
  credentialId: string;
  credentialSecret: string;
  nonce: string;
  project: string;
  operation: LoopRuntimePublicRequest["mode"];
  payload: unknown;
}>;

export type ConfiguredInboundAdapterDependencies = Omit<
  PreparedInboundRuntimeExecutionDependencies,
  "verifier" | "replayProtectionPort" | "runtimeResolver"
> &
  Readonly<{
    credentialRecords: readonly ConfiguredApiKeyCredentialRecord[];
    aclRules: readonly ConfiguredInboundAclRule[];
    replayDirectory: string;
    runtimeResolver: PreparedInboundRuntimeResolver;
  }>;

export type ConfiguredInboundAdapterResult =
  | PreparedInboundRuntimeExecutionResult
  | Readonly<{
      schemaVersion: typeof CONFIGURED_INBOUND_ADAPTER_SCHEMA_VERSION;
      outcome: "rejected";
      requestId: string | null;
      stage: "adapter";
      reason: ConfiguredInboundAdapterFailureReason;
    }>
  | Readonly<{
      schemaVersion: typeof CONFIGURED_INBOUND_ADAPTER_SCHEMA_VERSION;
      outcome: "rejected";
      requestId: string;
      stage: "acl";
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidRequest(value: unknown): value is ConfiguredInboundAdapterRequest {
  if (!isOrdinaryObject(value)) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = [
    "requestId",
    "evaluatedAt",
    "credentialId",
    "credentialSecret",
    "nonce",
    "project",
    "operation",
    "payload",
  ] as const;
  const keys = Reflect.ownKeys(descriptors);
  return (
    keys.length === expected.length &&
    expected.every((key) => keys.includes(key)) &&
    expected.every((key) => isEnumerableDataProperty(descriptors[key])) &&
    isNonEmptyString(descriptors.requestId!.value) &&
    isNonEmptyString(descriptors.evaluatedAt!.value) &&
    Number.isFinite(Date.parse(descriptors.evaluatedAt!.value)) &&
    isNonEmptyString(descriptors.credentialId!.value) &&
    isNonEmptyString(descriptors.credentialSecret!.value) &&
    isNonEmptyString(descriptors.nonce!.value) &&
    isNonEmptyString(descriptors.project!.value) &&
    (descriptors.operation!.value === "dry-run" ||
      descriptors.operation!.value === "execute")
  );
}

function adapterRejection(
  requestId: string | null,
  reason: ConfiguredInboundAdapterFailureReason,
): ConfiguredInboundAdapterResult {
  return Object.freeze({
    schemaVersion: CONFIGURED_INBOUND_ADAPTER_SCHEMA_VERSION,
    outcome: "rejected" as const,
    requestId,
    stage: "adapter" as const,
    reason,
  });
}

function aclRejection(
  requestId: string,
  reason: ConfiguredInboundAclDenyReason,
): ConfiguredInboundAdapterResult {
  return Object.freeze({
    schemaVersion: CONFIGURED_INBOUND_ADAPTER_SCHEMA_VERSION,
    outcome: "rejected" as const,
    requestId,
    stage: "acl" as const,
    reason,
  });
}

function unknownIdentityReference(credentialId: string): string {
  return createHash("sha256")
    .update("loop-engine:unknown-inbound-identity:v1\0", "utf8")
    .update(credentialId, "utf8")
    .digest("hex");
}

/**
 * V14.5 pilot adapter. It translates one minimal configured inbound request
 * into the existing transport-neutral envelope, derives identity and ACL only
 * from explicit configuration, installs the persistent replay port, and then
 * delegates exactly once to the V14.3 application service.
 *
 * No provider, Runtime resolver, authorizer, assembler, execution context,
 * credential source, environment variable, or network transport is inferred.
 */
export async function executeConfiguredInboundAdapterRequest(
  request: ConfiguredInboundAdapterRequest,
  dependencies: ConfiguredInboundAdapterDependencies,
): Promise<ConfiguredInboundAdapterResult> {
  if (!isValidRequest(request)) {
    return adapterRejection(null, "malformed_request");
  }
  if (!validateConfiguredApiKeyCredentialRecords(dependencies.credentialRecords)) {
    return adapterRejection(request.requestId, "credential_configuration_invalid");
  }
  if (!validateConfiguredInboundAclRules(dependencies.aclRules)) {
    return adapterRejection(request.requestId, "acl_configuration_invalid");
  }

  let replayProtectionPort;
  try {
    replayProtectionPort = createFileInboundReplayProtectionPort({
      directory: dependencies.replayDirectory,
    });
  } catch {
    return adapterRejection(request.requestId, "replay_configuration_invalid");
  }

  const record = dependencies.credentialRecords.find(
    (candidate) => candidate.credentialId === request.credentialId,
  );
  const principal = record?.principal ?? null;
  const acl = evaluateConfiguredInboundAcl({
    principal,
    project: request.project,
    operation: request.operation,
    rules: dependencies.aclRules,
  });
  const unknownReference = unknownIdentityReference(request.credentialId);
  const evidenceId = record
    ? deriveConfiguredApiKeyEvidenceId(record)
    : unknownReference;

  const envelope: InboundLoopRuntimeRequestEnvelope = Object.freeze({
    requestId: request.requestId,
    authenticationInput: Object.freeze({
      method: CONFIGURED_API_KEY_METHOD,
      credential: Object.freeze({
        credentialId: request.credentialId,
        secret: request.credentialSecret,
      }),
      issuerHint: record?.issuerId ?? null,
      subjectHint: record?.subjectId ?? null,
    }),
    verificationContext: Object.freeze({
      requestId: request.requestId,
      evaluatedAt: request.evaluatedAt,
    }),
    principal,
    accessRequest: Object.freeze({
      requestId: request.requestId,
      principalId: record?.principal.principalId ?? unknownReference,
      tenantId: record?.principal.tenantId ?? null,
      project: request.project,
      operation: request.operation,
    }),
    replayEvidence: Object.freeze({
      requestId: request.requestId,
      evidenceId,
      receivedAt: request.evaluatedAt,
      nonce: request.nonce,
      replayed: false,
    }),
    policy: Object.freeze({
      allowedOperations: Object.freeze(
        acl.allowed ? [request.operation] : [],
      ),
      replayCheckRequired: true,
    }),
    evaluatedAt: request.evaluatedAt,
    payload: request.payload,
  });

  const result = await executePreparedInboundRuntimeRequest(envelope, {
    verifier: createConfiguredApiKeyVerifier(dependencies.credentialRecords),
    replayProtectionPort,
    authorizer: dependencies.authorizer,
    assembler: dependencies.assembler,
    executionContextResolver: dependencies.executionContextResolver,
    runtimeResolver: dependencies.runtimeResolver,
  });

  if (
    !acl.allowed &&
    result.outcome === "rejected" &&
    result.stage === "security" &&
    result.reason === "operation_not_allowed"
  ) {
    return aclRejection(request.requestId, acl.reason);
  }

  if (result.schemaVersion !== PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION) {
    return adapterRejection(request.requestId, "malformed_request");
  }

  return result;
}
