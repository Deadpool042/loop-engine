import {
  createAuthorizationConfiguration as createConfiguration,
  resolveAuthorizationConfiguration as resolveConfiguration,
  summarizeAuthorizationConfiguration as summarizeConfiguration,
  validateAuthorizationConfiguration as validateConfiguration,
  type AuthorizationConfiguration,
  type AuthorizationConfigurationRequest,
  type AuthorizationConfigurationResult,
  type AuthorizationConfigurationSummary,
} from "../authorization/index.js";
import type { AuthorizationDecision } from "../policy/index.js";

export type CreateAuthorizationConfigurationOptions = Parameters<
  typeof createConfiguration
>[1];

/** Creates a default-deny configuration request without an execution payload. */
export function createAuthorizationConfiguration(
  decision: AuthorizationDecision,
  options: CreateAuthorizationConfigurationOptions = {},
): AuthorizationConfigurationRequest {
  return createConfiguration(decision, options);
}

/** Validates configuration only; no Provider, Runtime, or Transport is invoked. */
export function validateAuthorizationConfiguration(
  request: AuthorizationConfigurationRequest,
): AuthorizationConfigurationResult {
  return validateConfiguration(request);
}

/** Resolves only a declarative configuration identity. */
export function resolveAuthorizationConfiguration(
  request: AuthorizationConfigurationRequest,
) {
  return resolveConfiguration(request);
}

/** Produces an immutable compatibility summary for review. */
export function summarizeAuthorizationConfiguration(
  configuration: AuthorizationConfiguration | null,
  request: AuthorizationConfigurationRequest,
): AuthorizationConfigurationSummary {
  return summarizeConfiguration(configuration, request);
}
