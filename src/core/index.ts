/** Stable internal integration boundary for CLI and future adapters. */
export * from "./audit.js";
export * from "./loop.js";
export * from "./loop-runtime-escalation-serialization.js";
export * from "./loop-runtime-escalation-delivery.js";
export * from "./loop-runtime-escalation.js";
export * from "./loop-runtime-public-request.js";
export * from "./loop-runtime-public-request-decoder.js";
export * from "./loop-runtime-public-request-authorization.js";
export * from "./loop-runtime-public-request-authorization-evaluation.js";
export * from "./loop-runtime-public-request-authorization-facade.js";
export * from "./loop-runtime-public-request-authorized-entry.js";
export * from "./loop-runtime-public-request-engine-assembly.js";
export * from "./loop-runtime-public-request-resolution.js";
export * from "./loop-runtime-public-request-configuration.js";
export * from "./loop-runtime-public-request-limits.js";
export * from "./loop-runtime-public-request-execution-plan.js";
export * from "./loop-runtime-public-request-runtime-options.js";
export * from "./loop-runtime-public-request-runtime-request.js";
export * from "./loop-runtime-public-request-preparation.js";
export * from "./loop-runtime-public-request-entry-preparation.js";
export * from "./loop-runtime-outcome.js";
export * from "./runtime.js";
export * from "./runtime-execution-bridge.js";
export {
  createRuntimeCapability,
  createRuntimeCapabilityRequirement,
  evaluateRuntimeCapability,
  evaluateRuntimeCapabilityCompatibility,
  summarizeRuntimeCapability,
  summarizeRuntimeCapabilityCompatibility,
  validateRuntimeCapability,
  validateRuntimeCapabilityRequirement,
  type RuntimeCapabilityCompatibilityResult,
  type RuntimeCapabilityError,
  type RuntimeCapabilityErrorCode,
  type RuntimeCapabilityInput,
  type RuntimeCapabilityRequirementInput,
  type RuntimeCapabilityResult,
} from "./runtime-capability.js";
export {
  selectRuntimeByCapabilities,
  summarizeRuntimeCapabilitySelection,
  type RuntimeCapabilityCandidateEvaluation,
  type RuntimeCapabilitySelectionResult,
} from "./runtime-resolution.js";
export {
  createRuntimeRequest as createDeclarativeRuntimeRequest,
  evaluateRuntimeRequest as evaluateDeclarativeRuntimeRequest,
  summarizeRuntimeRequest as summarizeDeclarativeRuntimeRequest,
  validateRuntimeRequest as validateDeclarativeRuntimeRequest,
  type RuntimeRequestError as DeclarativeRuntimeRequestError,
  type RuntimeRequestErrorCode as DeclarativeRuntimeRequestErrorCode,
  type RuntimeRequestInput as DeclarativeRuntimeRequestInput,
  type RuntimeRequestResult as DeclarativeRuntimeRequestResult,
} from "./runtime-request.js";
export {
  createRuntimeRegistry as createDeclarativeRuntimeRegistry,
  evaluateRuntimeRegistry as evaluateDeclarativeRuntimeRegistry,
  summarizeRuntimeRegistry as summarizeDeclarativeRuntimeRegistry,
  validateRuntimeRegistry as validateDeclarativeRuntimeRegistry,
  type RuntimeRegistryDescriptor as DeclarativeRuntimeRegistryDescriptor,
  type RuntimeRegistryError as DeclarativeRuntimeRegistryError,
  type RuntimeRegistryErrorCode as DeclarativeRuntimeRegistryErrorCode,
  type RuntimeRegistryInput as DeclarativeRuntimeRegistryInput,
  type RuntimeRegistryResult as DeclarativeRuntimeRegistryResult,
} from "./runtime-registry.js";
export * from "./providers.js";
export * from "./mapping.js";
export * from "./intent.js";
export * from "./policy.js";
export * from "./authorization.js";
export * from "./transport-request.js";
export * from "./transport-request-builder.js";
export * from "./review.js";
export * from "./provenance.js";
export * from "./handoff-eligibility.js";
export * from "./dispatch.js";
export * from "./boundary.js";
export * from "./transports.js";
export * from "./reports.js";
export * from "./types.js";

export { loadConfig, type Config, type ProjectConfig } from "./config.js";
export { findProject, getRequiredProjectName } from "./project.js";
export { isAuditProfile } from "../audit/profiles.js";
export {
  isAuditRuleStability,
  isAuditRuleTag,
  type AuditRuleSelection,
} from "../audit/registry.js";
export { LOOP_RUN_MODES, type LoopRunMode } from "../loop/types.js";
