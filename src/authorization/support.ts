import type {
  AuthorizationConfiguration,
  AuthorizationConfigurationRequest,
  AuthorizationConfigurationSummary,
} from "./types.js";

export function isAuthorizationConfigurationAllowed(
  configuration: AuthorizationConfiguration,
  request: AuthorizationConfigurationRequest,
): boolean {
  return (
    request.policy.enabled &&
    request.policy.allowedConfigurationIds.includes(configuration.id)
  );
}

export function summarizeAuthorizationConfiguration(
  configuration: AuthorizationConfiguration | null,
  request: AuthorizationConfigurationRequest,
): AuthorizationConfigurationSummary {
  const requirement = configuration?.requirement;
  const evaluation = request.decision.evaluation;
  const intent = evaluation.intent;
  const mapping = evaluation.mapping;
  const requiredTransportCapabilities = [
    ...(mapping?.requiredTransportCapabilities ?? []),
    ...(intent?.requiredCapabilities ?? []),
  ];
  return Object.freeze({
    decisionAuthorized: request.decision.status === "authorized",
    providerCompatible:
      requirement !== undefined &&
      requirement.providerId === evaluation.providerPlan.providerId &&
      requirement.provider === evaluation.providerPlan.provider,
    protocolCompatible:
      requirement !== undefined &&
      requirement.protocolVersion ===
        evaluation.protocolPlan?.request.protocolVersion,
    mappingCompatible:
      requirement !== undefined && requirement.mappingId === mapping?.id,
    intentCompatible:
      requirement !== undefined && requirement.intentId === intent?.id,
    runtimeCompatible:
      requirement !== undefined &&
      requirement.runtimeId === evaluation.providerPlan.runtimeId,
    transportCompatible:
      requirement !== undefined &&
      requirement.transportId === intent?.transportId &&
      requiredTransportCapabilities.every((capability) =>
        requirement.approvedTransportCapabilities.includes(capability),
      ),
    versionsCompatible:
      requirement !== undefined &&
      requirement.policyVersion === request.versions.policyVersion &&
      requirement.protocolVersion === request.versions.protocolVersion &&
      requirement.mappingVersion === request.versions.mappingVersion &&
      requirement.runtimeVersion === request.versions.runtimeVersion &&
      requirement.transportVersion === request.versions.transportVersion,
    policyAllowed:
      configuration !== null &&
      isAuthorizationConfigurationAllowed(configuration, request),
    active: configuration?.active ?? false,
    approved: configuration?.approved ?? false,
    reviewRequired: configuration?.reviewRequired ?? true,
  });
}

export function supportsAuthorizationConfiguration(
  configuration: AuthorizationConfiguration,
  request: AuthorizationConfigurationRequest,
): boolean {
  const summary = summarizeAuthorizationConfiguration(configuration, request);
  return (
    summary.providerCompatible &&
    summary.protocolCompatible &&
    summary.mappingCompatible &&
    summary.intentCompatible &&
    summary.runtimeCompatible &&
    summary.transportCompatible &&
    summary.versionsCompatible
  );
}
