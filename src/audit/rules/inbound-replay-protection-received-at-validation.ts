import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "isInvalidReplayProtectionReceivedAt(replay.receivedAt)",
  '"replay_rejected"',
]);

export function inspectInboundReplayProtectionReceivedAtValidationInvariant(
  source: string,
): Readonly<{ missing: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_REPLAY_PROTECTION_RECEIVED_AT_VALIDATION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-478",
    category: "architecture",
    severity: "error",
    title: "Inbound replay-protection port receivedAt is validated as an instant",
    description:
      "The V14.1a authentication boundary must reject an accepted replay-protection port result whose receivedAt is not itself a parseable instant.",
    metadata: {
      introducedIn: "V14.1a",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-477"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundReplayProtectionReceivedAtValidationInvariant(source);
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
