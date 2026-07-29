import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const SUBJECT_BINDING =
  "input.authenticationInput.subjectHint !== verification.evidence.subjectId";
const ISSUER_BINDING =
  "input.authenticationInput.issuerHint !== verification.evidence.issuerId";
const EVALUATION_TIME_MISMATCH = '"evaluation_time_mismatch"';
const REPLAY_CALL = "evaluateInboundReplayProtection(";

export function inspectInboundAuthenticationIssuerBindingGateInvariant(
  source: string,
): Readonly<{ ordered: boolean }> {
  const subjectBindingIndex = source.indexOf(SUBJECT_BINDING);
  const issuerBindingIndex = source.indexOf(ISSUER_BINDING);
  const evaluationTimeMismatchIndex = source.indexOf(EVALUATION_TIME_MISMATCH);
  const replayCallIndex = source.indexOf(REPLAY_CALL);

  return Object.freeze({
    ordered:
      subjectBindingIndex !== -1 &&
      issuerBindingIndex !== -1 &&
      evaluationTimeMismatchIndex !== -1 &&
      replayCallIndex !== -1 &&
      subjectBindingIndex < issuerBindingIndex &&
      issuerBindingIndex < evaluationTimeMismatchIndex &&
      issuerBindingIndex < replayCallIndex,
  });
}

export const INBOUND_AUTHENTICATION_ISSUER_BINDING_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-487",
    category: "architecture",
    severity: "error",
    title:
      "Inbound authentication issuer hint binding follows subject binding and precedes downstream evidence consumption",
    description:
      "The V14.1f authentication boundary must validate the authenticationInput.issuerHint/evidence.issuerId binding after subject binding and before any temporal validation, Security preparation, or replay-protection port invocation.",
    metadata: {
      introducedIn: "V14.1f",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-486"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundAuthenticationIssuerBindingGateInvariant(source);

      const details = result.ordered
        ? []
        : [
            `${FILE} -> invalid authentication issuer hint binding gate ordering`,
          ];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();
