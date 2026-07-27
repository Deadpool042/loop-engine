import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUEST_BINDING =
  "replayEvidence.requestId !== input.security.accessRequest.requestId";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundReplayRequestBindingGateInvariant(
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

export const INBOUND_REPLAY_REQUEST_BINDING_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-455",
    category: "architecture",
    severity: "error",
    title: "Inbound replay request binding precedes replay protection",
    description:
      "The V14.0o authentication boundary must bind replay evidence to the authenticated request's requestId before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0o",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-454"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayRequestBindingGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid replay request binding gate ordering`]),
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
