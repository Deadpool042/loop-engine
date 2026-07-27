import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/inbound-security/replay-protection.ts";

const REQUIRED = Object.freeze([
  "export type InboundReplayProtectionInput",
  "export type InboundReplayProtectionPort = Readonly<{",
  "export type InboundReplayProtectionResult",
  "export async function evaluateInboundReplayProtection(",
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
  "pg",
  "node:child_process",
]);

export function inspectInboundReplayProtectionNeutralityInvariant(
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

export const INBOUND_REPLAY_PROTECTION_NEUTRALITY_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-434",
    category: "architecture",
    severity: "error",
    title: "Inbound replay protection port stays injected and non-operational",
    description:
      "The V14.0e replay-protection port must remain explicit, injected, fail-closed, and free of persistence, cache, filesystem, network, process, environment, randomness, implicit clock, or concrete backend behavior.",
    metadata: {
      introducedIn: "V14.0e",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-433"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayProtectionNeutralityInvariant(source);
      const details = [
        ...result.missing.map((token) => `${FILE} -> missing: ${token}`),
        ...result.forbidden.map((token) => `${FILE} -> forbidden: ${token}`),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Keep replay protection as an injected contract only; concrete persistence and transport integrations belong to later adapters.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();
