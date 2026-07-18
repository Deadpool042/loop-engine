import {
  createAuthorizationConfigurationError,
  createAuthorizationConfigurationResult,
} from "./errors.js";
import { selectAuthorizationConfiguration } from "./selector.js";
import {
  isAuthorizationConfigurationAllowed,
  summarizeAuthorizationConfiguration,
} from "./support.js";
import type {
  AuthorizationConfiguration,
  AuthorizationConfigurationRegistry,
  AuthorizationConfigurationRequest,
  AuthorizationConfigurationResolution,
  AuthorizationConfigurationResult,
} from "./types.js";

function configurationResult(
  request: AuthorizationConfigurationRequest,
  configuration: AuthorizationConfiguration,
  status: AuthorizationConfigurationResult["status"],
  message: string,
): AuthorizationConfigurationResult {
  return createAuthorizationConfigurationResult(
    request,
    status,
    createAuthorizationConfigurationError(status, message),
    summarizeAuthorizationConfiguration(configuration, request),
    configuration.id,
  );
}

/** Resolves configuration identity only; it never crosses an execution boundary. */
export function resolveAuthorizationConfiguration(
  request: AuthorizationConfigurationRequest,
  registry?: AuthorizationConfigurationRegistry,
): AuthorizationConfigurationResolution {
  const selection = selectAuthorizationConfiguration(request, registry);
  if (selection.outcome === "rejected") return selection;
  if (!selection.configuration.active) {
    return {
      outcome: "rejected",
      error: createAuthorizationConfigurationError(
        "configuration_inactive",
        "Authorization configuration is inactive by default.",
      ),
    };
  }
  return {
    outcome: "resolved",
    configuration: selection.configuration,
    request,
  };
}

/** Validates a declarative configuration in a fixed default-deny order. */
export function validateAuthorizationConfiguration(
  request: AuthorizationConfigurationRequest,
  registry?: AuthorizationConfigurationRegistry,
): AuthorizationConfigurationResult {
  const selection = selectAuthorizationConfiguration(request, registry);
  if (selection.outcome === "rejected") {
    return createAuthorizationConfigurationResult(
      request,
      selection.error.code,
      selection.error,
      summarizeAuthorizationConfiguration(null, request),
    );
  }
  const { configuration } = selection;
  if (request.decision.status !== "authorized") {
    return configurationResult(
      request,
      configuration,
      "configuration_not_authorized",
      "Authorization decision is not authorized.",
    );
  }
  if (!configuration.active) {
    return configurationResult(
      request,
      configuration,
      "configuration_inactive",
      "Authorization configuration is inactive by default.",
    );
  }
  if (!isAuthorizationConfigurationAllowed(configuration, request)) {
    return configurationResult(
      request,
      configuration,
      "configuration_policy_denied",
      "Authorization configuration is denied by configuration policy.",
    );
  }
  if (!configuration.approved) {
    return configurationResult(
      request,
      configuration,
      "configuration_unapproved",
      "Authorization configuration is not approved.",
    );
  }
  if (configuration.reviewRequired) {
    return configurationResult(
      request,
      configuration,
      "configuration_review_required",
      "Authorization configuration requires review.",
    );
  }
  return configurationResult(
    request,
    configuration,
    "configuration_unapproved",
    "Authorization configuration cannot authorize execution in V10.8.",
  );
}
