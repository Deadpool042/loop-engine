import { supportsAuthorizationConfiguration } from "./support.js";
import type {
  AuthorizationConfiguration,
  AuthorizationConfigurationId,
  AuthorizationConfigurationRegistry,
} from "./types.js";

export const OpenClawAuthorizationConfiguration: AuthorizationConfiguration =
  Object.freeze({
    id: "openclaw-plan-review",
    requirement: Object.freeze({
      providerId: "openclaw",
      provider: "local",
      protocolVersion: "loop-engine-openclaw-planning/v1",
      mappingId: "openclaw-planning",
      intentId: "openclaw-plan",
      runtimeId: "openclaw",
      transportId: "local-process",
      approvedTransportCapabilities: Object.freeze([]),
      policyVersion: "default-deny/v1",
      mappingVersion: "loop-engine-openclaw-planning/v1",
      runtimeVersion: "openclaw/v1",
      transportVersion: "local-process/v1",
    }),
    active: false,
    approved: false,
    reviewRequired: true,
    reviewMetadata: Object.freeze({ status: "required" }),
    configured: false,
    supports: (request) =>
      supportsAuthorizationConfiguration(
        OpenClawAuthorizationConfiguration,
        request,
      ),
  });

export function createAuthorizationConfigurationRegistry(
  configurations: readonly AuthorizationConfiguration[],
): AuthorizationConfigurationRegistry {
  const ids = new Set<string>();
  for (const configuration of configurations) {
    if (ids.has(configuration.id)) {
      throw new Error(
        `Duplicate authorization configuration id: ${configuration.id}`,
      );
    }
    ids.add(configuration.id);
  }
  return Object.freeze({ configurations: Object.freeze([...configurations]) });
}

// Fixed declaration order only: no discovery, plugins, dynamic imports,
// reflection, filesystem lookup, or dependency injection.
export const AUTHORIZATION_CONFIGURATION_REGISTRY =
  createAuthorizationConfigurationRegistry([
    OpenClawAuthorizationConfiguration,
  ]);

export function getAuthorizationConfiguration(
  id: AuthorizationConfigurationId,
  registry: AuthorizationConfigurationRegistry = AUTHORIZATION_CONFIGURATION_REGISTRY,
): AuthorizationConfiguration | null {
  return (
    registry.configurations.find((configuration) => configuration.id === id) ??
    null
  );
}
