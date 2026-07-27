import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const OPERATION =
  "input.security.accessRequest.operation !== decoded.request.mode";
const POLICY_ADMISSION = "isInboundOperationAllowed(";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundOperationPolicyAdmissionGateInvariant(
  source: string,
): Readonly<{
  ordered: boolean;
  replayCallCount: number;
}> {
  const operationIndex = source.indexOf(OPERATION);
  const policyAdmissionIndex = source.indexOf(POLICY_ADMISSION);
  const replayIndex = source.indexOf(REPLAY);

  return Object.freeze({
    ordered:
      operationIndex !== -1 &&
      policyAdmissionIndex !== -1 &&
      replayIndex !== -1 &&
      operationIndex < policyAdmissionIndex &&
      policyAdmissionIndex < replayIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_OPERATION_POLICY_ADMISSION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-453",
    category: "architecture",
    severity: "error",
    title: "Inbound operation policy admission precedes replay protection",
    description:
      "The V14.0n authentication boundary must bind the requested operation, admit it against policy.allowedOperations, and only then invoke the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0n",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-452"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundOperationPolicyAdmissionGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid operation policy admission gate ordering`]),
        ...(result.replayCallCount === 1
          ? []
          : [`${FILE} -> replay call count: ${result.replayCallCount}`]),
      ];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();
