import type { RuntimeCapabilityCompatibilityResult } from "../capability/types.js";

/** A declarative, runtime-neutral resolution derived from Runtime Request evidence. */
export type RuntimeResolutionInput = Readonly<{
  id: string;
  version: string;
  resolvedAt: string;
  request: Readonly<{
    id: string;
    version: string;
    constructible: boolean;
    executionAllowed: false;
    executionStarted: false;
  }>;
  descriptorReferences: readonly string[];
}>;

export const RUNTIME_RESOLUTION_ERROR_CODES = [
  "runtime_resolution_missing",
  "runtime_resolution_invalid",
  "runtime_resolution_request_missing",
  "runtime_resolution_request_invalid",
] as const;
export type RuntimeResolutionErrorCode =
  (typeof RUNTIME_RESOLUTION_ERROR_CODES)[number];

export type RuntimeResolutionError = Readonly<{
  code: RuntimeResolutionErrorCode;
  message: string;
  executionAllowed: false;
  executionStarted: false;
}>;

export type RuntimeResolutionResult = Readonly<{
  input: RuntimeResolutionInput;
  diagnostics: readonly RuntimeResolutionError[];
  valid: boolean;
  resolutionEligible: boolean;
  executionAllowed: false;
  executionStarted: false;
}>;

export type RuntimeCapabilityCandidateEvaluation = Readonly<{
  runtimeId: string;
  compatible: boolean;
  requirements: readonly RuntimeCapabilityCompatibilityResult[];
}>;

/** Declarative selection evidence. It never contains an adapter or callback. */
export type RuntimeCapabilitySelectionResult = Readonly<{
  outcome: "selected" | "unsupported";
  runtimeId: string | null;
  compatibleRuntimeIds: readonly string[];
  candidates: readonly RuntimeCapabilityCandidateEvaluation[];
  diagnostics: readonly string[];
  executionAllowed: false;
  executionStarted: false;
}>;
