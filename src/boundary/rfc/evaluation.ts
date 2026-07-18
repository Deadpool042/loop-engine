// ExecutionBoundaryBuilder evaluates immutable RFC invariants over a
// BoundaryHandoffResult. It produces no operational handoff.

import type { BoundaryHandoffResult } from "../types.js";
import {
  createExecutionBoundaryError,
  createExecutionBoundaryResult,
} from "./errors.js";
import {
  buildExecutionBoundaryRFC,
  summarizeExecutionBoundaryRFC as summarizeExecutionBoundaryRFCValue,
} from "./support.js";
import type {
  ExecutionBoundaryBuilder,
  ExecutionBoundaryResult,
  ExecutionBoundarySummary,
  ExecutionBoundaryValidation,
} from "./types.js";
import {
  validateExecutionBoundaryInput,
  validateExecutionBoundaryRFC as validateExecutionBoundaryRFCValue,
} from "./validation.js";

export const createExecutionBoundaryRFC: ExecutionBoundaryBuilder = (
  handoff,
) => {
  const inputValidation = validateExecutionBoundaryInput(handoff);
  const rfc = buildExecutionBoundaryRFC(
    handoff,
    inputValidation.valid ? "evaluated" : handoff ? "invalid" : "pending",
  );
  const rfcValidation = inputValidation.valid
    ? validateExecutionBoundaryRFCValue(rfc)
    : inputValidation;
  const error = rfcValidation.error;
  return createExecutionBoundaryResult(
    rfc,
    summarizeExecutionBoundaryRFCValue(rfc),
    rfcValidation,
    error,
  );
};

export function validateExecutionBoundaryRFC(
  rfc: ExecutionBoundaryResult["rfc"] | null,
): ExecutionBoundaryValidation {
  return validateExecutionBoundaryRFCValue(rfc);
}

export function summarizeExecutionBoundaryRFC(
  result: ExecutionBoundaryResult,
): ExecutionBoundarySummary {
  return result.summary;
}

export function normalizeExecutionBoundaryRFC(
  result: ExecutionBoundaryResult,
): ExecutionBoundaryResult {
  return result.validation.valid
    ? result
    : createExecutionBoundaryResult(
        result.rfc,
        result.summary,
        result.validation,
        result.error ??
          createExecutionBoundaryError(
            "boundary_invalid",
            "ExecutionBoundaryRFC validation failed.",
          ),
      );
}
