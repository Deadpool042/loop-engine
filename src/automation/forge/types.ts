/**
 * V18.4 public Automation Forge contracts.
 *
 * This package is forge- and provider-agnostic and contains declarations only.
 * It does not implement forges, factories, registries, selectors, registration,
 * or selection; it performs no I/O, process, network, or filesystem operation.
 */

import type {
  AutomationCapability,
  AutomationContext,
  AutomationMetadata,
  AutomationRequest,
} from "../types.js";

export type AutomationForgeId = string;

export type AutomationForgeCapability = AutomationCapability;

export type AutomationForgeMetadata = Readonly<{
  schemaVersion: 1;
  forgeId: AutomationForgeId;
  labels: readonly string[];
  attributes: Readonly<Record<string, string>>;
}>;

export type AutomationForgeRequest = Readonly<{
  requestId: string;
  automationRequest: AutomationRequest;
  context: AutomationContext;
  metadata: AutomationForgeMetadata;
}>;

export type AutomationForgeError = Readonly<{
  code:
    | "invalid_request"
    | "unsupported_capability"
    | "policy_denied"
    | "forge_unavailable"
    | "result_invalid"
    | "internal_error";
  message: string;
  metadata: AutomationForgeMetadata;
}>;

export type AutomationForgeResult =
  | Readonly<{
      status: "accepted" | "completed";
      forgeId: AutomationForgeId;
      error: null;
      metadata: AutomationForgeMetadata;
    }>
  | Readonly<{
      status: "rejected" | "failed";
      forgeId: AutomationForgeId | null;
      error: AutomationForgeError;
      metadata: AutomationForgeMetadata;
    }>;

/**
 * Port for a forge admitted by a caller-owned policy boundary.
 * The method is a declaration only; this package supplies no invocation logic.
 */
export interface AutomationForge {
  readonly id: AutomationForgeId;
  readonly capabilities: readonly AutomationForgeCapability[];
  readonly metadata: AutomationForgeMetadata;
  handle(request: AutomationForgeRequest): AutomationForgeResult;
}

/**
 * Factory port for constructing one forge from explicit metadata.
 * No factory implementation or dependency-injection container is supplied.
 */
export interface AutomationForgeFactory {
  readonly forgeId: AutomationForgeId;
  create(metadata: AutomationForgeMetadata): AutomationForge;
}

/**
 * Immutable forge collection contract. Registration remains outside this
 * package and is intentionally not modeled as a method.
 */
export interface AutomationForgeRegistry {
  readonly forges: readonly AutomationForge[];
  readonly metadata: AutomationMetadata;
}

/**
 * Deterministic selector port. The result is either one forge already in the
 * registry or a stable forge error; no selection algorithm is supplied.
 */
export interface AutomationForgeSelector {
  select(
    request: AutomationForgeRequest,
    registry: AutomationForgeRegistry,
  ): AutomationForge | AutomationForgeError;
}
