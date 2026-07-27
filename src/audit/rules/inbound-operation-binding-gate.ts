import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const DECODE = "decodeLoopRuntimePublicRequest(input.payload)";
const OPERATION =
  "input.security.accessRequest.operation !== decoded.request.mode";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundOperationBindingGateInvariant(
  source: string,
): Readonly<{
  ordered: boolean;
  replayCallCount: number;
}> {
  const decodeIndex = source.indexOf(DECODE);
  const operationIndex = source.indexOf(OPERATION);
  const replayIndex = source.indexOf(REPLAY);

  return Object.freeze({
    ordered:
      decodeIndex !== -1 &&
      operationIndex !== -1 &&
      replayIndex !== -1 &&
      decodeIndex < operationIndex &&
      operationIndex < replayIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_OPERATION_BINDING_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-451",
    category: "architecture",
    severity: "error",
    title: "Inbound operation binding precedes replay protection",
    description:
      "The V14.0m authentication boundary must decode and bind the requested operation before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0m",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-450"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundOperationBindingGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid operation binding gate ordering`]),
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
