import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const HANDLER_FILE = "src/core/inbound.ts";

const REQUIRED_TOKENS = Object.freeze([
  "await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(",
  "if (!validation.valid) {",
  "if (!result.verified) {",
  "if (!result.security.allowed) {",
]);

const FORBIDDEN_TOKENS = Object.freeze([
  "evaluateInboundAuthenticationVerifier(",
  "evaluateInboundSecurity(",
  "evaluateInboundSecurityAndPrepareLoopRuntimeRequest(",
  "prepareAuthorizedLoopRuntimeRequest(",
  "executeRuntime",
]);

export function inspectInboundRequestHandlerGateInvariant(
  source: string,
): Readonly<{
  missing: readonly string[];
  forbidden: readonly string[];
  validationBeforeVerification: boolean;
}> {
  const missing = REQUIRED_TOKENS.filter((token) => !sourceIncludesToken(source, token));
  const forbidden = FORBIDDEN_TOKENS.filter((token) => sourceIncludesToken(source, token));

  const validationCheckIndex = source.indexOf("if (!validation.valid) {");
  const verificationCallIndex = source.indexOf(
    "await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(",
  );

  return Object.freeze({
    missing: Object.freeze(missing),
    forbidden: Object.freeze(forbidden),
    validationBeforeVerification:
      validationCheckIndex !== -1 &&
      verificationCallIndex !== -1 &&
      validationCheckIndex < verificationCallIndex,
  });
}

export const INBOUND_REQUEST_HANDLER_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-431",
    category: "architecture",
    severity: "error",
    title: "Inbound handler composes V14.0b rather than bypassing authentication/security gates",
    description:
      "The V14.0c transport-neutral handler must validate the untrusted envelope before any authentication verification, and must call only the existing V14.0b facade — never the lower-level V14.0a/V14.0b/Runtime functions it composes.",
    metadata: {
      introducedIn: "V14.0c",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-430"],
    },
    check: () => {
      const source = existsSync(HANDLER_FILE) ? readFileSync(HANDLER_FILE, "utf8") : "";
      const result = inspectInboundRequestHandlerGateInvariant(source);
      const details = [
        ...result.missing.map((token) => `${HANDLER_FILE} -> missing: ${token}`),
        ...result.forbidden.map((token) => `${HANDLER_FILE} -> forbidden: ${token}`),
        ...(result.validationBeforeVerification
          ? []
          : [`${HANDLER_FILE} -> envelope validation must precede authentication verification`]),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Validate the envelope first, fail closed on any inconsistency, and delegate exclusively to verifyInboundAuthenticationAndPrepareLoopRuntimeRequest for everything downstream.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze([HANDLER_FILE]));
    },
  };

  return rule;
})();
