import { getRuntimeAdapter } from "./registry.js";
import type { RuntimeRequest, RuntimeSelectionResult } from "./types.js";

/**
 * Pure deterministic selection. Policy remains responsible for selecting a
 * compatible agent profile; this selector only resolves its runtime to a
 * registered adapter and verifies explicit runtime/provider restrictions.
 */
export function selectRuntime(request: RuntimeRequest): RuntimeSelectionResult {
  const selected = request.resolvedAgentPolicy.selection;
  const selectedRuntime =
    request.requestedRuntime ??
    (selected?.outcome === "selected" ? selected.profile.runtime : null);

  if (!selectedRuntime) {
    return {
      outcome: "unsupported",
      reason:
        "runtime selection requires a selected agent profile or requested runtime",
    };
  }

  const adapter = getRuntimeAdapter(selectedRuntime);
  if (!adapter) {
    return {
      outcome: "unsupported",
      reason: `runtime ${selectedRuntime} is not registered`,
    };
  }

  if (!adapter.supports(request)) {
    return {
      outcome: "unsupported",
      reason: `runtime ${selectedRuntime} does not support the resolved request`,
    };
  }

  return { outcome: "selected", adapter };
}
