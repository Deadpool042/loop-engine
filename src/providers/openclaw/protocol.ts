import type { OpenClawOperationDefinition } from "./types.js";

/**
 * This static declaration is an internal planning schema. It documents no
 * executable OpenClaw command, flag, argument, binary, or external version.
 */
export const OPENCLAW_OPERATION_REGISTRY: readonly OpenClawOperationDefinition[] =
  Object.freeze([
    Object.freeze({
      operation: "plan",
      requiredProviderCapabilities: Object.freeze([]),
      requiredAgentPermissions: Object.freeze(["read_only"] as const),
      requiredRuntimeCapabilities: Object.freeze([]),
      requiredTransportCapabilities: Object.freeze([]),
      protocolValid: true,
      executable: false,
    }),
  ]);
