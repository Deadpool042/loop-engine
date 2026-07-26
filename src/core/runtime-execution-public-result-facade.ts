import type { PolicyAwareDeclarativeRuntimeExecutionBridgeInput } from "./runtime-execution-bridge.js";
import {
  executePolicyAwareDeclarativeRuntimeWithReceiptReport,
  type PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult,
} from "./runtime-execution-receipt-reporting-integration.js";
import {
  projectRuntimeExecutionReceiptReportingResult,
  serializeRuntimeExecutionReceiptReportingResult,
  type RuntimeExecutionReceiptReportingPublicResult,
} from "./runtime-execution-receipt-reporting-serialization.js";

export type RuntimeExecutionPublicResultFacade = Readonly<{
  result: RuntimeExecutionReceiptReportingPublicResult;
  serialized: string;
}>;

/**
 * Pure finalization step over an already-integrated execution result.
 * The returned facade contains only the public projection and its stable JSON.
 */
export function finalizeRuntimeExecutionPublicResult(
  integrated: PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult,
): RuntimeExecutionPublicResultFacade {
  const result = projectRuntimeExecutionReceiptReportingResult(integrated);
  return Object.freeze({
    result,
    serialized: serializeRuntimeExecutionReceiptReportingResult(integrated),
  });
}

/**
 * Opt-in Core facade: execute exactly once through the established V13.77 path,
 * then expose only the V13.78 public projection and stable serialization.
 */
export async function executePolicyAwareDeclarativeRuntimePublicResult(
  input: PolicyAwareDeclarativeRuntimeExecutionBridgeInput,
): Promise<RuntimeExecutionPublicResultFacade> {
  const integrated = await executePolicyAwareDeclarativeRuntimeWithReceiptReport(input);
  return finalizeRuntimeExecutionPublicResult(integrated);
}
