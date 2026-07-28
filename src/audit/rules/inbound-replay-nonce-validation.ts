import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "isInvalidPresentReplayNonce(replayEvidence)",
  '"replay_rejected"',
]);

export function inspectInboundReplayNonceValidationInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_REPLAY_NONCE_VALIDATION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-468",
    category: "architecture",
    severity: "error",
    title: "Inbound replay nonce is validated before replay protection",
    description:
      "The V14.0v authentication boundary must reject a present-but-blank replay nonce before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0v",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-467"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayNonceValidationInvariant(source);
      const details = result.missing.map(
        (token) => `${FILE} -> missing: ${token}`,
      );

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();
