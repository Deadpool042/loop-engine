import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

export type InboundSecurityContractInvariant = Readonly<{
  file: string;
  requiredTokens: readonly string[];
  forbiddenTokens: readonly string[];
}>;

export const INBOUND_SECURITY_CONTRACT_INVARIANTS = Object.freeze({
  types: Object.freeze({
    file: "src/inbound-security/types.ts",
    requiredTokens: Object.freeze([
      "export type InboundAuthenticationEvidence",
      "export type InboundPrincipal",
      "export type InboundAccessRequest",
      "export type InboundReplayEvidence",
      "export type InboundAccessPolicy",
      "export type InboundSecurityDecision",
      '"authentication_missing"',
      '"authentication_invalid"',
      '"authentication_expired"',
      '"authentication_not_yet_valid"',
      '"principal_mismatch"',
      '"tenant_mismatch"',
      '"operation_not_allowed"',
      '"operation_mismatch"',
      '"replay_evidence_missing"',
      '"replay_rejected"',
      '"insufficient_evidence"',
    ]),
    forbiddenTokens: Object.freeze([
      "rawToken",
      "bearerToken",
      "passwordValue",
      "apiKey",
      "privateKey",
      "cookieValue",
      "authorizationHeader",
    ]),
  }),
  evaluation: Object.freeze({
    file: "src/inbound-security/evaluation.ts",
    requiredTokens: Object.freeze([
      "export function evaluateInboundSecurity(",
      "evaluatedAt: string",
      'denyInboundSecurity(requestId, "authentication_missing")',
      'allowInboundSecurity(requestId, input.principal.principalId)',
    ]),
    forbiddenTokens: Object.freeze([
      "Date.now(",
      "new Date()",
      "Math.random(",
      "readFileSync",
      "readFile(",
      "fetch(",
      "node:child_process",
      "child_process",
      "process.env",
      "require(",
    ]),
  }),
  coreGate: Object.freeze({
    file: "src/core/inbound-security.ts",
    requiredTokens: Object.freeze([
      'import { evaluateInboundSecurity } from "../inbound-security/evaluation.js";',
      "authorizeLoopRuntimePublicRequest(",
      "prepareAuthorizedLoopRuntimeDecodedRequest",
      'if (decision.kind !== "allow") {',
    ]),
    forbiddenTokens: Object.freeze([
      "decodeLoopRuntimePublicRequest(",
      ".assemble(",
      "resolveLoopRuntimePublicRequestReferences(",
      "executeRuntime",
      "node:child_process",
      "node:net",
      "node:http",
      "fetch(",
    ]),
  }),
  coreExport: Object.freeze({
    file: "src/core/index.ts",
    requiredTokens: Object.freeze(["./inbound-security.js"]),
    forbiddenTokens: Object.freeze([]),
  }),
}) satisfies Readonly<Record<string, InboundSecurityContractInvariant>>;

export function inspectInboundSecurityContractInvariant(
  source: string,
  invariant: InboundSecurityContractInvariant,
): Readonly<{ missing: readonly string[]; forbidden: readonly string[] }> {
  return Object.freeze({
    missing: Object.freeze(
      invariant.requiredTokens.filter((token) => !sourceIncludesToken(source, token)),
    ),
    forbidden: Object.freeze(
      invariant.forbiddenTokens.filter((token) => sourceIncludesToken(source, token)),
    ),
  });
}

export const INBOUND_SECURITY_CONTRACT_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-426",
    category: "architecture",
    severity: "error",
    title: "Inbound security contract stays pure, non-operational, and fail-closed",
    description:
      "The inbound boundary security contract (evidence, principal, ACL decision, replay) is declarative and deterministic, carries no secret material, and its evaluator never touches the clock, filesystem, network, or a process.",
    metadata: {
      introducedIn: "V14.0a",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-425"],
    },
    check: () => {
      const details: string[] = [];
      const files: string[] = [];

      for (const invariant of Object.values(INBOUND_SECURITY_CONTRACT_INVARIANTS)) {
        files.push(invariant.file);
        const source = existsSync(invariant.file)
          ? readFileSync(invariant.file, "utf8")
          : "";
        const result = inspectInboundSecurityContractInvariant(source, invariant);
        details.push(
          ...result.missing.map((token) => `${invariant.file} -> missing: ${token}`),
          ...result.forbidden.map(
            (token) => `${invariant.file} -> forbidden: ${token}`,
          ),
        );
      }

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Keep the inbound security contract declarative, deterministic, and free of secret material, clock access, filesystem, network, or process usage.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze(files));
    },
  };

  return rule;
})();
