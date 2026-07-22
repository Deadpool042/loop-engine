import type { BoundaryHandoffResult } from "../types.js";
import {
  createExecutionBoundaryError,
  createExecutionBoundaryValidation,
} from "./errors.js";
import type {
  ExecutionBoundaryErrorCode,
  ExecutionBoundaryRFC,
  ExecutionBoundaryValidation,
} from "./types.js";

function invalid(
  code: ExecutionBoundaryErrorCode,
  message: string,
): ExecutionBoundaryValidation {
  return createExecutionBoundaryValidation(
    createExecutionBoundaryError(code, message),
  );
}

export function validateExecutionBoundaryInput(
  handoff: BoundaryHandoffResult | null,
): ExecutionBoundaryValidation {
  if (!handoff) {
    return invalid(
      "boundary_missing",
      "ExecutionBoundaryRFC requires a BoundaryHandoffResult.",
    );
  }
  if (!handoff.validation.valid || handoff.status !== "validated") {
    return invalid(
      "boundary_invalid",
      "ExecutionBoundaryRFC requires a valid BoundaryHandoffResult.",
    );
  }
  if (!handoff.summary.evidenceComplete) {
    return invalid(
      "boundary_evidence_missing",
      "ExecutionBoundaryRFC requires complete boundary handoff evidence.",
    );
  }
  if (!handoff.summary.reviewReferenced) {
    return invalid(
      "boundary_review_required",
      "ExecutionBoundaryRFC requires review evidence.",
    );
  }
  if (!handoff.summary.policyReferenced) {
    return invalid(
      "boundary_policy_denied",
      "ExecutionBoundaryRFC requires explicit policy evidence.",
    );
  }
  if (Object.keys(handoff.metadata).length === 0) {
    return invalid(
      "boundary_configuration_missing",
      "ExecutionBoundaryRFC requires configuration metadata.",
    );
  }
  if (handoff.ready || handoff.accepted || handoff.dispatchable) {
    return invalid(
      "boundary_not_ready",
      "ExecutionBoundaryRFC must remain below the execution boundary.",
    );
  }
  return createExecutionBoundaryValidation();
}

export function validateExecutionBoundaryRFC(
  rfc: ExecutionBoundaryRFC | null,
): ExecutionBoundaryValidation {
  if (!rfc) {
    return invalid("boundary_missing", "ExecutionBoundaryRFC is missing.");
  }
  if (!rfc.id || !rfc.evidence.handoffId) {
    return invalid(
      "boundary_evidence_missing",
      "ExecutionBoundaryRFC evidence is incomplete.",
    );
  }
  if (rfc.status === "invalid") {
    return invalid("boundary_invalid", "ExecutionBoundaryRFC is invalid.");
  }
  if (rfc.invariants.length === 0) {
    return invalid(
      "boundary_invariant_failed",
      "ExecutionBoundaryRFC must define invariant families.",
    );
  }
  if (rfc.invariants.some((item) => !item.satisfied)) {
    return invalid(
      "boundary_invariant_failed",
      "ExecutionBoundaryRFC invariant evaluation failed.",
    );
  }
  if (
    rfc.boundarySatisfied ||
    rfc.crossingAllowed ||
    rfc.dispatchable ||
    rfc.executable
  ) {
    return invalid(
      "boundary_not_ready",
      "ExecutionBoundaryRFC must not permit crossing, dispatch, or execution.",
    );
  }
  return createExecutionBoundaryValidation();
}
