import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const GATE_FILE = "src/core/inbound-authentication.ts";

const REQUIRED_TOKENS = Object.freeze([
  "await evaluateInboundAuthenticationVerifier(",
  "if (!verification.verified) {",
  "evidence: verification.evidence,",
  "await evaluateInboundSecurityAndPrepareLoopRuntimeRequest({",
]);

const FORBIDDEN_TOKENS = Object.freeze([
  "prepareAuthorizedLoopRuntimeRequest(",
  "evaluateInboundSecurity(",
  "executeRuntime",
  "node:child_process",
  "node:http",
  "node:https",
  "node:net",
  "fetch(",
]);

export function inspectInboundAuthenticationGateInvariant(
  source: string,
): Readonly<{
  missing: readonly string[];
  forbidden: readonly string[];
  verificationBeforeSecurity: boolean;
  failureBeforeSecurity: boolean;
}> {
  const missing = REQUIRED_TOKENS.filter((token) => !sourceIncludesToken(source, token));
  const forbidden = FORBIDDEN_TOKENS.filter((token) => sourceIncludesToken(source, token));

  const verificationCallIndex = source.indexOf(
    "await evaluateInboundAuthenticationVerifier(",
  );
  const failureCheckIndex = source.indexOf("if (!verification.verified) {");
  const securityCallIndex = source.indexOf(
    "await evaluateInboundSecurityAndPrepareLoopRuntimeRequest(",
  );

  return Object.freeze({
    missing: Object.freeze(missing),
    forbidden: Object.freeze(forbidden),
    verificationBeforeSecurity:
      verificationCallIndex !== -1 &&
      securityCallIndex !== -1 &&
      verificationCallIndex < securityCallIndex,
    failureBeforeSecurity:
      failureCheckIndex !== -1 &&
      securityCallIndex !== -1 &&
      failureCheckIndex < securityCallIndex,
  });
}

export const INBOUND_AUTHENTICATION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-429",
    category: "architecture",
    severity: "error",
    title: "Authentication verification gates trusted inbound security evaluation",
    description:
      "The V14.0b Core facade must complete authentication verification and return every verification failure before invoking the V14.0a inbound-security facade; only verifier-produced evidence may cross that trust boundary.",
    metadata: {
      introducedIn: "V14.0b",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-428"],
    },
    check: () => {
      const source = existsSync(GATE_FILE) ? readFileSync(GATE_FILE, "utf8") : "";
      const result = inspectInboundAuthenticationGateInvariant(source);
      const details = [
        ...result.missing.map((token) => `${GATE_FILE} -> missing: ${token}`),
        ...result.forbidden.map((token) => `${GATE_FILE} -> forbidden: ${token}`),
        ...(result.verificationBeforeSecurity
          ? []
          : [`${GATE_FILE} -> verifier call must precede inbound security evaluation`]),
        ...(result.failureBeforeSecurity
          ? []
          : [`${GATE_FILE} -> verification failure gate must precede inbound security evaluation`]),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Verify authentication first, fail closed on every non-success result, and call only the existing V14.0a facade with verifier-produced evidence.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze([GATE_FILE]));
    },
  };

  return rule;
})();
