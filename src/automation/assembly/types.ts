/**
 * V18.6 public Automation Application Assembly contracts.
 *
 * This package declares explicit Automation composition data only. It contains
 * no assembly implementation, selection algorithm, default dependency, hidden
 * registry, service locator, dependency-injection container, or runtime effect.
 */

import type { AutomationCapability, AutomationMetadata } from "../types.js";
import type {
  AutomationForgeId,
  AutomationForgeRegistry,
  AutomationForgeSelector,
} from "../forge/index.js";
import type {
  AutomationPolicy,
  AutomationPolicyDecision,
  AutomationPolicyEvaluator,
} from "../policy/index.js";
import type {
  AutomationProviderId,
  AutomationProviderRegistry,
  AutomationProviderSelector,
} from "../provider/index.js";

export type AutomationApplicationConfiguration = Readonly<{
  configurationId: string;
  capabilities: readonly AutomationCapability[];
  metadata: AutomationMetadata;
}>;

export type AutomationApplicationRegistry = Readonly<{
  providerRegistry: AutomationProviderRegistry;
  forgeRegistry: AutomationForgeRegistry;
  metadata: AutomationMetadata;
}>;

export type AutomationApplicationDependencies = Readonly<{
  providerSelector: AutomationProviderSelector;
  forgeSelector: AutomationForgeSelector;
  policyEvaluator: AutomationPolicyEvaluator;
}>;

export type AutomationApplicationSelection =
  | Readonly<{
      status: "selected";
      providerId: AutomationProviderId;
      forgeId: AutomationForgeId;
      policyDecision: AutomationPolicyDecision;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "rejected";
      providerId: null;
      forgeId: null;
      policyDecision: AutomationPolicyDecision | null;
      metadata: AutomationMetadata;
    }>;

export type AutomationApplicationAssembly = Readonly<{
  configuration: AutomationApplicationConfiguration;
  dependencies: AutomationApplicationDependencies;
  registry: AutomationApplicationRegistry;
  policy: AutomationPolicy;
  selection: AutomationApplicationSelection;
  metadata: AutomationMetadata;
}>;

export type AutomationApplicationAssemblyInput = Readonly<{
  configuration: AutomationApplicationConfiguration;
  dependencies: AutomationApplicationDependencies;
  registry: AutomationApplicationRegistry;
  policy: AutomationPolicy;
  selection: AutomationApplicationSelection;
  metadata: AutomationMetadata;
}>;

export type AutomationApplicationError = Readonly<{
  code:
    | "invalid_configuration"
    | "invalid_dependencies"
    | "invalid_registry"
    | "invalid_policy"
    | "invalid_selection"
    | "assembly_rejected";
  message: string;
  metadata: AutomationMetadata;
}>;

export type AutomationApplicationAssemblyResult =
  | Readonly<{
      status: "assembled";
      assembly: AutomationApplicationAssembly;
      error: null;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "rejected";
      assembly: null;
      error: AutomationApplicationError;
      metadata: AutomationMetadata;
    }>;
