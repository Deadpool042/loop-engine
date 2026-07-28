import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const EVALUATION_TIME_VALIDATION = "isInvalidEvaluationTime(input.evaluatedAt)";
const REPLAY_RECEIPT_TIME_VALIDATION =
  "isReplayReceiptTimeAfterEvaluation(replayEvidence, input.evaluatedAt)";

export function inspectInboundEvaluationTimeValidationGateInvariant(
  source: string,
): Readonly<{ ordered: boolean }> {
  const evaluationTimeValidationIndex = source.indexOf(
    EVALUATION_TIME_VALIDATION,
  );
  const replayReceiptTimeValidationIndex = source.indexOf(
    REPLAY_RECEIPT_TIME_VALIDATION,
  );

  return Object.freeze({
    ordered:
      evaluationTimeValidationIndex !== -1 &&
      replayReceiptTimeValidationIndex !== -1 &&
      evaluationTimeValidationIndex < replayReceiptTimeValidationIndex,
  });
}

export const INBOUND_EVALUATION_TIME_VALIDATION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-475",
    category: "architecture",
    severity: "error",
    title: "Inbound evaluationTime validation precedes replay temporal comparisons",
    description:
      "The V14.0y authentication boundary must validate that evaluatedAt is a well-formed instant before comparing replay evidence receivedAt against it.",
    metadata: {
      introducedIn: "V14.0y",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-474"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundEvaluationTimeValidationGateInvariant(source);

      const details = result.ordered
        ? []
        : [`${FILE} -> invalid evaluationTime validation gate ordering`];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();
