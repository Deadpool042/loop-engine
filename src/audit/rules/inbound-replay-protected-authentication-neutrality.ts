import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const REQUIRED = Object.freeze([
  "evaluateInboundAuthenticationVerifier(",
  "evaluateInboundReplayProtection(",
  "evaluateInboundSecurityAndPrepareLoopRuntimeRequest(",
  "replayProtectionPort",
]);

const FORBIDDEN = Object.freeze([
  "Date.now(",
  "new Date()",
  "Math.random(",
  "process.env",
  "node:fs",
  "node:http",
  "node:https",
  "node:net",
  "fetch(",
  "redis",
  "sqlite",
  "postgres",
  "node:child_process",
]);

export function inspectInboundReplayProtectedAuthenticationNeutralityInvariant(
  source: string,
): Readonly<{ missing: readonly string[]; forbidden: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
    forbidden: Object.freeze(
      FORBIDDEN.filter((token) => sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_REPLAY_PROTECTED_AUTHENTICATION_NEUTRALITY_RULE: AuditRule =
  (() => {
    const rule: AuditRule = {
      id: "AUDIT-436",
      category: "architecture",
      severity: "error",
      title: "Inbound authentication replay gate stays injected and neutral",
      description:
        "The V14.0f authentication facade must compose the injected replay-protection port without concrete persistence, transport, environment, randomness, or implicit clock behavior.",
      metadata: {
        introducedIn: "V14.0f",
        tags: ["architecture", "contract", "self-audit", "ci"],
        stability: "stable",
        dependsOn: ["AUDIT-435"],
      },
      check: () => {
        const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
        const result =
          inspectInboundReplayProtectedAuthenticationNeutralityInvariant(source);
        const details = [
          ...result.missing.map((token) => `${FILE} -> missing: ${token}`),
          ...result.forbidden.map((token) => `${FILE} -> forbidden: ${token}`),
        ];

        return details.length > 0
          ? fail(rule, `${rule.title}.`, details)
          : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
      },
    };

    return rule;
  })();
