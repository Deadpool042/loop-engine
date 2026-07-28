import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const NONCE_VALIDATION = "isInvalidPresentReplayNonce(replayEvidence)";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundReplayNonceValidationGateInvariant(
  source: string,
): Readonly<{
  ordered: boolean;
  replayCallCount: number;
}> {
  const nonceValidationIndex = source.indexOf(NONCE_VALIDATION);
  const replayIndex = source.indexOf(REPLAY);

  return Object.freeze({
    ordered:
      nonceValidationIndex !== -1 &&
      replayIndex !== -1 &&
      nonceValidationIndex < replayIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_REPLAY_NONCE_VALIDATION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-469",
    category: "architecture",
    severity: "error",
    title: "Inbound replay nonce validation precedes replay protection",
    description:
      "The V14.0v authentication boundary must validate the replay nonce before invoking the injected replay-protection port, and must invoke the port at most once.",
    metadata: {
      introducedIn: "V14.0v",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-468"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayNonceValidationGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid replay nonce validation gate ordering`]),
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
