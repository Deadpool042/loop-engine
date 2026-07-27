import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUEST_BINDING =
  "input.verificationContext.requestId !== input.security.accessRequest.requestId";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundVerificationRequestBindingGateInvariant(
  source: string,
): Readonly<{
  ordered: boolean;
  replayCallCount: number;
}> {
  const requestBindingIndex = source.indexOf(REQUEST_BINDING);
  const replayIndex = source.indexOf(REPLAY);

  return Object.freeze({
    ordered:
      requestBindingIndex !== -1 &&
      replayIndex !== -1 &&
      requestBindingIndex < replayIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_VERIFICATION_REQUEST_BINDING_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-465",
    category: "architecture",
    severity: "error",
    title: "Inbound verification request binding precedes replay protection",
    description:
      "The V14.0t authentication boundary must validate verificationContext/accessRequest identity binding before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0t",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-464"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundVerificationRequestBindingGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [
              `${FILE} -> invalid verification request binding gate ordering`,
            ]),
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
