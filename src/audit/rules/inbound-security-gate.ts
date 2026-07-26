import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const GATE_FILE = "src/core/inbound-security.ts";

const REQUIRED_TOKENS = Object.freeze([
  'if (decision.kind !== "allow") {',
  "return Object.freeze({",
  "allowed: false as const,",
  "await prepareAuthorizedLoopRuntimeRequest({",
  "allowed: true as const,",
]);

const FORBIDDEN_TOKENS = Object.freeze([
  "prepareAuthorizedLoopRuntimeRequest(input)",
]);

export function inspectInboundSecurityGateInvariant(
  source: string,
): Readonly<{
  missing: readonly string[];
  forbidden: readonly string[];
  gatesBeforePreparation: boolean;
}> {
  const missing = REQUIRED_TOKENS.filter((token) => !sourceIncludesToken(source, token));
  const forbidden = FORBIDDEN_TOKENS.filter((token) => sourceIncludesToken(source, token));

  const denyCheckIndex = source.indexOf('if (decision.kind !== "allow") {');
  const preparationCallIndex = source.indexOf(
    "await prepareAuthorizedLoopRuntimeRequest(",
  );

  const gatesBeforePreparation =
    denyCheckIndex !== -1 &&
    preparationCallIndex !== -1 &&
    denyCheckIndex < preparationCallIndex;

  return Object.freeze({
    missing: Object.freeze(missing),
    forbidden: Object.freeze(forbidden),
    gatesBeforePreparation,
  });
}

export const INBOUND_SECURITY_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-427",
    category: "architecture",
    severity: "error",
    title: "Inbound security gates downstream public-runtime preparation",
    description:
      "The inbound security Core facade must return the deny/indeterminate decision before any call to the existing public-runtime authorization/preparation chain, and must invoke that chain only once, unconditionally composed rather than duplicated.",
    metadata: {
      introducedIn: "V14.0a",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-426"],
    },
    check: () => {
      const source = existsSync(GATE_FILE) ? readFileSync(GATE_FILE, "utf8") : "";
      const result = inspectInboundSecurityGateInvariant(source);

      const details = [
        ...result.missing.map((token) => `${GATE_FILE} -> missing: ${token}`),
        ...result.forbidden.map((token) => `${GATE_FILE} -> forbidden: ${token}`),
        ...(result.gatesBeforePreparation
          ? []
          : [`${GATE_FILE} -> deny/indeterminate check must precede downstream preparation`]),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Return the deny/indeterminate decision before calling prepareAuthorizedLoopRuntimeRequest, and never invoke it unconditionally.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze([GATE_FILE]));
    },
  };

  return rule;
})();
