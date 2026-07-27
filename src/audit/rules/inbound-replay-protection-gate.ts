import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/inbound-security/replay-protection.ts";
const READ_PORT = "const check = readCheck(port);";
const PORT_CALL = "await Reflect.apply(check, port, [input])";

const FORBIDDEN = Object.freeze([
  "handleInboundLoopRuntimeRequest(",
  "verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(",
  "evaluateInboundSecurity(",
  "prepareAuthorizedLoopRuntimeRequest(",
  "executeRuntime",
]);

export function inspectInboundReplayProtectionGateInvariant(
  source: string,
): Readonly<{
  missing: readonly string[];
  forbidden: readonly string[];
  callCount: number;
  ordered: boolean;
}> {
  const required = [READ_PORT, PORT_CALL];
  const missing = required.filter((token) => !sourceIncludesToken(source, token));
  const forbidden = FORBIDDEN.filter((token) => sourceIncludesToken(source, token));
  const callCount = source.split(PORT_CALL).length - 1;
  const readIndex = source.indexOf(READ_PORT);
  const callIndex = source.indexOf(PORT_CALL);

  return Object.freeze({
    missing: Object.freeze(missing),
    forbidden: Object.freeze(forbidden),
    callCount,
    ordered: readIndex !== -1 && callIndex !== -1 && readIndex < callIndex,
  });
}

export const INBOUND_REPLAY_PROTECTION_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-435",
    category: "architecture",
    severity: "error",
    title: "Inbound replay protection invokes only the injected replay port",
    description:
      "The V14.0e evaluator must validate input, resolve the injected replay port, call it exactly once, and normalize failures without reaching handler, authentication, security, preparation, or Runtime layers.",
    metadata: {
      introducedIn: "V14.0e",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-434"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundReplayProtectionGateInvariant(source);
      const details = [
        ...result.missing.map((token) => `${FILE} -> missing: ${token}`),
        ...result.forbidden.map((token) => `${FILE} -> forbidden: ${token}`),
        ...(result.callCount === 1
          ? []
          : [`${FILE} -> replay port call count: ${result.callCount}`]),
        ...(result.ordered
          ? []
          : [`${FILE} -> replay port resolution must precede invocation`]),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Validate first, resolve the injected replay port, invoke it exactly once, and normalize every non-success path fail-closed.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();
