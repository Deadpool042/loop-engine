import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const AUTH = "evaluateInboundAuthenticationVerifier(";
const REPLAY = "evaluateInboundReplayProtection(";
const SECURITY = "evaluateInboundSecurityAndPrepareLoopRuntimeRequest(";

export function inspectInboundReplayProtectedAuthenticationGateInvariant(
  source: string,
): Readonly<{ ordered: boolean; replayCallCount: number }> {
  const authIndex = source.indexOf(AUTH);
  const replayIndex = source.indexOf(REPLAY);
  const securityIndex = source.indexOf(SECURITY);

  return Object.freeze({
    ordered:
      authIndex !== -1 &&
      replayIndex !== -1 &&
      securityIndex !== -1 &&
      authIndex < replayIndex &&
      replayIndex < securityIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_REPLAY_PROTECTED_AUTHENTICATION_GATE_RULE: AuditRule =
  (() => {
    const rule: AuditRule = {
      id: "AUDIT-437",
      category: "architecture",
      severity: "error",
      title: "Inbound authentication composes replay protection before security",
      description:
        "The V14.0f facade must authenticate first, invoke replay protection exactly once, and only then enter the inbound security preparation boundary.",
      metadata: {
        introducedIn: "V14.0f",
        tags: ["architecture", "contract", "self-audit", "ci"],
        stability: "stable",
        dependsOn: ["AUDIT-436"],
      },
      check: () => {
        const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
        const result =
          inspectInboundReplayProtectedAuthenticationGateInvariant(source);

        const details = [
          ...(result.ordered ? [] : [`${FILE} -> invalid gate ordering`]),
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
