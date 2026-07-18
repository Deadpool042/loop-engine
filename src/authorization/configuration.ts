import type {
  AuthorizationConfigurationRequest,
  AuthorizationConfigurationVersions,
} from "./types.js";

export type CreateAuthorizationConfigurationOptions = Readonly<{
  versions?: AuthorizationConfigurationVersions;
  policy?: AuthorizationConfigurationRequest["policy"];
  metadata?: AuthorizationConfigurationRequest["metadata"];
  requestedConfiguration?: AuthorizationConfigurationRequest["requestedConfiguration"];
}>;

/** Builds a default-deny declarative request without an executable payload. */
export function createAuthorizationConfiguration(
  decision: AuthorizationConfigurationRequest["decision"],
  options: CreateAuthorizationConfigurationOptions = {},
): AuthorizationConfigurationRequest {
  return Object.freeze({
    decision,
    versions:
      options.versions ??
      Object.freeze({
        policyVersion: "not_configured",
        protocolVersion: "not_configured",
        mappingVersion: "not_configured",
        runtimeVersion: "not_configured",
        transportVersion: "not_configured",
      }),
    policy:
      options.policy ??
      Object.freeze({
        enabled: false,
        allowedConfigurationIds: Object.freeze([]),
      }),
    metadata: Object.freeze({
      ...decision.evaluation.metadata,
      ...(options.metadata ?? {}),
    }),
    ...(options.requestedConfiguration === undefined
      ? {}
      : { requestedConfiguration: options.requestedConfiguration }),
  });
}
