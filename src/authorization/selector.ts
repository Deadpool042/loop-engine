import { createAuthorizationConfigurationError } from "./errors.js";
import {
  AUTHORIZATION_CONFIGURATION_REGISTRY,
  getAuthorizationConfiguration,
} from "./registry.js";
import { supportsAuthorizationConfiguration } from "./support.js";
import type {
  AuthorizationConfigurationRegistry,
  AuthorizationConfigurationRequest,
  AuthorizationConfigurationSelection,
} from "./types.js";

/** Pure explicit-first selection over a fixed declaration order. */
export function selectAuthorizationConfiguration(
  request: AuthorizationConfigurationRequest,
  registry: AuthorizationConfigurationRegistry = AUTHORIZATION_CONFIGURATION_REGISTRY,
): AuthorizationConfigurationSelection {
  if (request.requestedConfiguration !== undefined) {
    const configuration = getAuthorizationConfiguration(
      request.requestedConfiguration,
      registry,
    );
    if (configuration === null) {
      return {
        outcome: "rejected",
        error: createAuthorizationConfigurationError(
          "configuration_missing",
          "Requested authorization configuration is not registered.",
        ),
      };
    }
    return configuration.supports(request)
      ? { outcome: "selected", configuration }
      : {
          outcome: "rejected",
          error: createAuthorizationConfigurationError(
            "configuration_version_mismatch",
            "Authorization configuration does not match the decision.",
          ),
        };
  }
  const configuration = registry.configurations.find((candidate) =>
    supportsAuthorizationConfiguration(candidate, request),
  );
  return configuration === undefined
    ? {
        outcome: "rejected",
        error: createAuthorizationConfigurationError(
          "configuration_missing",
          "No authorization configuration matches the decision.",
        ),
      }
    : { outcome: "selected", configuration };
}
