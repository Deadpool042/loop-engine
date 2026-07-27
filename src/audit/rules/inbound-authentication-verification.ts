import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const VERIFICATION_FILE = "src/inbound-security/authentication-verification.ts";

const REQUIRED_TOKENS = Object.freeze([
  "export type InboundAuthenticationInput",
  "export type InboundAuthenticationVerifier = Readonly<{",
  "export type InboundAuthenticationVerificationResult",
  "export async function evaluateInboundAuthenticationVerifier(",
  "const verify = readVerifyFunction(verifier);",
  "await Reflect.apply(verify, verifier, [input, context])",
  'reason: "verification_unavailable" as const',
  'reason: "verification_invalid" as const',
]);

const FORBIDDEN_TOKENS = Object.freeze([
  "Date.now(",
  "new Date()",
  "Math.random(",
  "process.env",
  "node:child_process",
  "node:http",
  "node:https",
  "node:net",
  "fetch(",
  "readFileSync(",
  "writeFileSync(",
  "jsonwebtoken",
  "jose",
  "oauth",
]);

export function inspectInboundAuthenticationVerificationInvariant(
  source: string,
): Readonly<{ missing: readonly string[]; forbidden: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED_TOKENS.filter((token) => !sourceIncludesToken(source, token)),
    ),
    forbidden: Object.freeze(
      FORBIDDEN_TOKENS.filter((token) => sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_AUTHENTICATION_VERIFICATION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-428",
    category: "architecture",
    severity: "error",
    title: "Inbound authentication verification stays injected and non-operational",
    description:
      "Untrusted authentication material is handled only by an injected verifier port whose output is normalized fail-closed without transport, credential backend, crypto provider, network, filesystem, process, implicit clock, retry, or fallback behavior.",
    metadata: {
      introducedIn: "V14.0b",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-427"],
    },
    check: () => {
      const source = existsSync(VERIFICATION_FILE)
        ? readFileSync(VERIFICATION_FILE, "utf8")
        : "";
      const result = inspectInboundAuthenticationVerificationInvariant(source);
      const details = [
        ...result.missing.map((token) => `${VERIFICATION_FILE} -> missing: ${token}`),
        ...result.forbidden.map(
          (token) => `${VERIFICATION_FILE} -> forbidden: ${token}`,
        ),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Keep authentication verification dependency-injected, single-call, redacted, and free of concrete transport, credential, crypto, clock, filesystem, network, or process behavior.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze([VERIFICATION_FILE]));
    },
  };

  return rule;
})();
