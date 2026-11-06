/**
 * Effective authorization (L7.2 / E2b): rights of the principal ∩ service ceiling.
 * PURE and NOT WIRED (no gateway, adapter or Core consumes it).
 *
 * The principal is resolved by Loop Engine from ITS directory using only the
 * `principalId`; no role, tenant or right supplied by the caller is an input.
 * Both the principal's ACL and the service ceiling must allow the exact
 * (principal, project, operation) triple; the first denial wins and carries its
 * source. There is no default allow and no fallback to the other side.
 */

import { evaluateConfiguredInboundAcl } from "./configured-acl.js";
import type {
  ConfiguredInboundAclDenyReason,
  ConfiguredInboundAclRule,
} from "./configured-acl.js";
import type { InboundOperation } from "./inbound-operation.js";
import type { InboundPrincipalDirectory } from "./principal-directory.js";
import { evaluateServiceCeiling } from "./service-ceiling.js";
import type { InboundServiceCeilingDenyReason } from "./service-ceiling.js";

export type InboundEffectiveAuthorizationDecision =
  | Readonly<{
      allowed: true;
      principalId: string;
      keyId: string;
      ruleId: string;
    }>
  | Readonly<{
      allowed: false;
      source: "principal_directory";
      reason: "principal_unknown";
    }>
  | Readonly<{
      allowed: false;
      source: "principal_acl";
      reason: ConfiguredInboundAclDenyReason;
    }>
  | Readonly<{
      allowed: false;
      source: "service_ceiling";
      reason: InboundServiceCeilingDenyReason;
    }>;

export function evaluateEffectiveInboundAuthorization(
  input: Readonly<{
    directory: InboundPrincipalDirectory;
    principalId: string;
    keyId: string;
    project: string;
    operation: InboundOperation;
    aclRules: readonly ConfiguredInboundAclRule[];
    ceilingRules: unknown;
  }>,
): InboundEffectiveAuthorizationDecision {
  let principal;
  try {
    principal = input.directory.resolve(input.principalId);
  } catch {
    principal = null;
  }
  // A port that answers for another identifier is treated as unknown.
  if (
    principal === null ||
    principal === undefined ||
    principal.principalId !== input.principalId
  ) {
    return Object.freeze({
      allowed: false as const,
      source: "principal_directory" as const,
      reason: "principal_unknown" as const,
    });
  }

  const acl = evaluateConfiguredInboundAcl({
    principal,
    project: input.project,
    operation: input.operation,
    rules: input.aclRules,
  });
  if (!acl.allowed) {
    return Object.freeze({
      allowed: false as const,
      source: "principal_acl" as const,
      reason: acl.reason,
    });
  }

  const ceiling = evaluateServiceCeiling({
    keyId: input.keyId,
    project: input.project,
    operation: input.operation,
    rules: input.ceilingRules,
  });
  if (!ceiling.allowed) {
    return Object.freeze({
      allowed: false as const,
      source: "service_ceiling" as const,
      reason: ceiling.reason,
    });
  }

  return Object.freeze({
    allowed: true as const,
    principalId: principal.principalId,
    keyId: ceiling.keyId,
    ruleId: acl.ruleId,
  });
}
