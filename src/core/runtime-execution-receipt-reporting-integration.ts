import {
  executePolicyAwareDeclarativeRuntimeWithReceipt,
  type PolicyAwareDeclarativeRuntimeExecutionBridgeInput,
  type PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult,
} from "./runtime-execution-bridge.js";
import {
  createRuntimeExecutionReceiptReport,
  type RuntimeExecutionReceiptReport,
} from "./runtime-execution-receipt-report.js";

export type PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult =
  | (Extract<
      PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult,
      { outcome: "executed" }
    > &
      Readonly<{ report: RuntimeExecutionReceiptReport }>)
  | (Exclude<
      PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult,
      { outcome: "executed" }
    > &
      Readonly<{ report: null }>);

/**
 * Pure reporting projection over an already-produced receipt execution result.
 * It never executes a runtime and never changes historical execution reporting.
 */
export function attachRuntimeExecutionReceiptReport(
  result: PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult,
): PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult {
  if (result.outcome !== "executed") {
    return Object.freeze({
      ...result,
      report: null,
    }) as PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult;
  }

  return Object.freeze({
    ...result,
    report: createRuntimeExecutionReceiptReport(result.receipt),
  }) as PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult;
}

/**
 * Opt-in Core integration: execute once through the established receipt boundary,
 * then attach the additive receipt report envelope.
 */
export async function executePolicyAwareDeclarativeRuntimeWithReceiptReport(
  input: PolicyAwareDeclarativeRuntimeExecutionBridgeInput,
): Promise<PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult> {
  const result = await executePolicyAwareDeclarativeRuntimeWithReceipt(input);
  return attachRuntimeExecutionReceiptReport(result);
}
