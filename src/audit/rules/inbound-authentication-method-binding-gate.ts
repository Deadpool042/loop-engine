import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const VERIFIED_CHECK = "if (!verification.verified)";
const METHOD_BINDING =
  "input.authenticationInput.method !== verification.evidence.method";
const EVALUATION_TIME_MISMATCH = '"evaluation_time_mismatch"';
const REPLAY_CALL = "evaluateInboundReplayProtection(";

export function inspectInboundAuthenticationMethodBindingGateInvariant(
  source: string,
): Readonly<{ ordered: boolean }> {
  const verifiedCheckIndex = source.indexOf(VERIFIED_CHECK);
  const methodBindingIndex = source.indexOf(METHOD_BINDING);
  const evaluationTimeMismatchIndex = source.indexOf(EVALUATION_TIME_MISMATCH);
  const replayCallIndex = source.indexOf(REPLAY_CALL);

  return Object.freeze({
    ordered:
      verifiedCheckIndex !== -1 &&
      methodBindingIndex !== -1 &&
      evaluationTimeMismatchIndex !== -1 &&
      replayCallIndex !== -1 &&
      verifiedCheckIndex < methodBindingIndex &&
      methodBindingIndex < evaluationTimeMismatchIndex &&
      methodBindingIndex < replayCallIndex,
  });
}

export const INBOUND_AUTHENTICATION_METHOD_BINDING_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-483",
    category: "architecture",
    severity: "error",
    title:
      "Inbound authentication method binding follows successful verification and precedes downstream evidence consumption",
    description:
      "The V14.1d authentication boundary must validate the authenticationInput.method/evidence.method binding after a successful verification and before any temporal validation, Security preparation, or replay-protection port invocation.",
    metadata: {
      introducedIn: "V14.1d",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-482"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundAuthenticationMethodBindingGateInvariant(source);

      const details = result.ordered
        ? []
        : [
            `${FILE} -> invalid authentication method binding gate ordering`,
          ];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();
