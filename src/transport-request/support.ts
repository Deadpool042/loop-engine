import type {
  AuthorizationConfigurationResult,
  AuthorizationConfigurationSummary,
} from "../authorization/types.js";
import type {
  TransportRequest,
  TransportRequestCreationOptions,
  TransportRequestSummary,
} from "./types.js";

export const OpenClawTransportRequestFixture: TransportRequest = Object.freeze({
  id: "transport-request.openclaw.plan",
  status: "validation_required",
  providerId: "openclaw",
  provider: "local",
  mapping: Object.freeze({ mappingId: "openclaw-planning" }),
  authorization: Object.freeze({
    configurationId: "openclaw-plan-review",
    authorized: false,
    reviewRequired: true,
    executionStarted: false,
  }),
  runtime: Object.freeze({ runtimeId: "openclaw" }),
  transport: Object.freeze({ transportId: "local-process" }),
  capabilities: Object.freeze([
    Object.freeze({
      capabilityId: "shell_exec",
      source: "authorization_configuration",
    }),
  ]),
  policy: Object.freeze({
    policyId: "openclaw-default-deny",
    configurationId: "openclaw-plan-review",
  }),
  metadata: Object.freeze({ fixture: "openclaw-transport-request" }),
  active: false,
  dispatchable: false,
  executable: false,
  validationRequired: true,
});

function freezeDeep<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeDeep(child);
  }
  return Object.freeze(value);
}

function metadataValue(
  metadata: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function summarizeTransportRequest(
  request: TransportRequest,
): TransportRequestSummary {
  return Object.freeze({
    authorizationReferenced: request.authorization.configurationId.length > 0,
    providerReferenced: request.providerId.length > 0,
    mappingReferenced: request.mapping.mappingId.length > 0,
    runtimeReferenced: request.runtime.runtimeId.length > 0,
    transportReferenced: request.transport.transportId.length > 0,
    capabilityReferenced: request.capabilities.length > 0,
    policyReferenced: request.policy.policyId.length > 0,
    authorized: request.authorization.authorized,
    active: request.active,
    dispatchable: request.dispatchable,
    executable: request.executable,
    validationRequired: request.validationRequired,
  });
}

function statusFromAuthorizationSummary(
  summary: AuthorizationConfigurationSummary,
): TransportRequest["status"] {
  return summary.decisionAuthorized ? "validation_required" : "inactive";
}

export function createTransportRequestFromAuthorization(
  configurationResult: AuthorizationConfigurationResult,
  options: TransportRequestCreationOptions = {},
): TransportRequest {
  const evaluation = configurationResult.decision.evaluation;
  const requirement = evaluation.policy;
  const configurationId = configurationResult.configurationId;
  const metadata = Object.freeze({
    ...configurationResult.metadata,
    ...options.metadata,
  });
  const requestId =
    options.id ??
    metadataValue(metadata, "transportRequestId") ??
    metadataValue(metadata, "requestId") ??
    "transport-request.openclaw.plan";

  return freezeDeep({
    id: requestId,
    status: statusFromAuthorizationSummary(configurationResult.summary),
    providerId: evaluation.providerPlan.providerId,
    provider: evaluation.providerPlan.provider,
    mapping: {
      mappingId: configurationResult.summary.mappingCompatible
        ? configurationResult.decision.evaluation.mapping!.id
        : evaluation.mapping?.id ?? "openclaw-planning",
    },
    authorization: {
      configurationId: configurationId ?? "openclaw-plan-review",
      authorized: configurationResult.decision.status === "authorized",
      reviewRequired: configurationResult.summary.reviewRequired,
      executionStarted: false,
    },
    runtime: { runtimeId: evaluation.providerPlan.runtimeId },
    transport: {
      transportId:
        evaluation.intent?.transportId ??
        OpenClawTransportRequestFixture.transport.transportId,
    },
    capabilities:
      configurationResult.decision.evaluation.policy.capabilitySet.capabilities.map(
        (capabilityId) => ({
          capabilityId,
          source: "authorization_configuration" as const,
        }),
      ),
    policy: {
      policyId: requirement.id,
      configurationId: configurationId ?? "openclaw-plan-review",
    },
    metadata,
    active: false,
    dispatchable: false,
    executable: false,
    validationRequired: true,
  });
}
