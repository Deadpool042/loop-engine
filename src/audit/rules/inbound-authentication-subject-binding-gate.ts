import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const METHOD_BINDING =
  "input.authenticationInput.method !== verification.evidence.method";
const SUBJECT_BINDING =
  "input.authenticationInput.subjectHint !== verification.evidence.subjectId";
const EVALUATION_TIME_MISMATCH = '"evaluation_time_mismatch"';
const REPLAY_CALL = "evaluateInboundReplayProtection(";

export function inspectInboundAuthenticationSubjectBindingGateInvariant(
  source: string,
): Readonly<{ ordered: boolean }> {
  const methodBindingIndex = source.indexOf(METHOD_BINDING);
  const subjectBindingIndex = source.indexOf(SUBJECT_BINDING);
  const evaluationTimeMismatchIndex = source.indexOf(EVALUATION_TIME_MISMATCH);
  const replayCallIndex = source.indexOf(REPLAY_CALL);

  return Object.freeze({
    ordered:
      methodBindingIndex !== -1 &&
      subjectBindingIndex !== -1 &&
      evaluationTimeMismatchIndex !== -1 &&
      replayCallIndex !== -1 &&
      methodBindingIndex < subjectBindingIndex &&
      subjectBindingIndex < evaluationTimeMismatchIndex &&
      subjectBindingIndex < replayCallIndex,
  });
}

export const INBOUND_AUTHENTICATION_SUBJECT_BINDING_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-485",
    category: "architecture",
    severity: "error",
    title:
      "Inbound authentication subject hint binding follows method binding and precedes downstream evidence consumption",
    description:
      "The V14.1e authentication boundary must validate the authenticationInput.subjectHint/evidence.subjectId binding after the method binding and before any temporal validation, Security preparation, or replay-protection port invocation.",
    metadata: {
      introducedIn: "V14.1e",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-484"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundAuthenticationSubjectBindingGateInvariant(source);

      const details = result.ordered
        ? []
        : [
            `${FILE} -> invalid authentication subject hint binding gate ordering`,
          ];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();
