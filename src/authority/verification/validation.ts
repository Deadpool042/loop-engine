import type { ExecutionAuthority } from "../../dispatch/types.js";
import type { OperatorApprovalResult } from "../rfc/types.js";
import { authorityVerificationError, validationFor } from "./errors.js";
import type { AuthorityVerificationContext, AuthorityVerificationError, AuthorityVerificationValidation } from "./types.js";

export function validateAuthorityVerificationInput(authority: ExecutionAuthority | null, approval: OperatorApprovalResult | null, context: AuthorityVerificationContext | null): AuthorityVerificationValidation {
  const errors: AuthorityVerificationError[] = [];
  if (!context) errors.push(authorityVerificationError("verification_input_missing", "Verification context is required."));
  else if (!context.verificationAt || !context.subject || !context.supported) errors.push(authorityVerificationError(!context.supported ? "verification_unsupported" : "verification_context_invalid", "Verification context is incomplete or unsupported."));
  if (!authority) errors.push(authorityVerificationError("authority_missing", "Execution authority is required."));
  else if (!authority.id) errors.push(authorityVerificationError("authority_invalid", "Execution authority is structurally invalid."));
  if (!approval) errors.push(authorityVerificationError("approval_missing", "Operator approval is required."));
  else if (!approval.approval.id || !approval.approval.review) errors.push(authorityVerificationError("approval_invalid", "Operator approval is structurally invalid."));
  return validationFor(errors);
}
