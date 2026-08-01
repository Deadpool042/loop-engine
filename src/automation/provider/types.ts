/**
 * V18.3 public Automation Provider contracts.
 *
 * This package is provider-agnostic and contains declarations only. It does
 * not implement providers, factories, registries, selectors, registration, or
 * selection; it performs no I/O, process, network, or filesystem operation.
 */

import type {
  AutomationCapability,
  AutomationContext,
  AutomationMetadata,
  AutomationRequest,
} from "../types.js";

export type AutomationProviderId = string;

export type AutomationProviderCapability = AutomationCapability;

export type AutomationProviderMetadata = Readonly<{
  schemaVersion: 1;
  providerId: AutomationProviderId;
  labels: readonly string[];
  attributes: Readonly<Record<string, string>>;
}>;

export type AutomationProviderRequest = Readonly<{
  requestId: string;
  automationRequest: AutomationRequest;
  context: AutomationContext;
  metadata: AutomationProviderMetadata;
}>;

export type AutomationProviderError = Readonly<{
  code:
    | "invalid_request"
    | "unsupported_capability"
    | "policy_denied"
    | "provider_unavailable"
    | "result_invalid"
    | "internal_error";
  message: string;
  metadata: AutomationProviderMetadata;
}>;

export type AutomationProviderResult =
  | Readonly<{
      status: "accepted" | "completed";
      providerId: AutomationProviderId;
      error: null;
      metadata: AutomationProviderMetadata;
    }>
  | Readonly<{
      status: "rejected" | "failed";
      providerId: AutomationProviderId | null;
      error: AutomationProviderError;
      metadata: AutomationProviderMetadata;
    }>;

/**
 * Port for a provider admitted by a caller-owned policy boundary.
 * The method is a declaration only; this package supplies no invocation logic.
 */
export interface AutomationProvider {
  readonly id: AutomationProviderId;
  readonly capabilities: readonly AutomationProviderCapability[];
  readonly metadata: AutomationProviderMetadata;
  provide(request: AutomationProviderRequest): AutomationProviderResult;
}

/**
 * Factory port for constructing one provider from explicit metadata.
 * No factory implementation or dependency-injection container is supplied.
 */
export interface AutomationProviderFactory {
  readonly providerId: AutomationProviderId;
  create(metadata: AutomationProviderMetadata): AutomationProvider;
}

/**
 * Immutable provider collection contract. Registration remains outside this
 * package and is intentionally not modeled as a method.
 */
export interface AutomationProviderRegistry {
  readonly providers: readonly AutomationProvider[];
  readonly metadata: AutomationMetadata;
}

/**
 * Deterministic selector port. The result is either one provider already in
 * the registry or a stable provider error; no selection algorithm is supplied.
 */
export interface AutomationProviderSelector {
  select(
    request: AutomationProviderRequest,
    registry: AutomationProviderRegistry,
  ): AutomationProvider | AutomationProviderError;
}
