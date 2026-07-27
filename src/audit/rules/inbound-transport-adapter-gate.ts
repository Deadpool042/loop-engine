import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const ADAPTER_FILE = "src/core/inbound-transport.ts";
const DECODE_CALL = "await Reflect.apply(decode, adapter, [input])";
const HANDLER_CALL = "await handleInboundLoopRuntimeRequest(";
const RESPONSE_CALL = "await Reflect.apply(mapResponse, adapter, [handled])";

const FORBIDDEN_TOKENS = Object.freeze([
  "verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(",
  "evaluateInboundAuthenticationVerifier(",
  "evaluateInboundSecurity(",
  "evaluateInboundSecurityAndPrepareLoopRuntimeRequest(",
  "prepareAuthorizedLoopRuntimeRequest(",
  "executeRuntime",
]);

export function inspectInboundTransportAdapterGateInvariant(
  source: string,
): Readonly<{
  missing: readonly string[];
  forbidden: readonly string[];
  handlerCallCount: number;
  ordered: boolean;
}> {
  const required = [DECODE_CALL, HANDLER_CALL, RESPONSE_CALL];
  const missing = required.filter((token) => !sourceIncludesToken(source, token));
  const forbidden = FORBIDDEN_TOKENS.filter((token) => sourceIncludesToken(source, token));
  const handlerCallCount = source.split(HANDLER_CALL).length - 1;
  const decodeIndex = source.indexOf(DECODE_CALL);
  const handlerIndex = source.indexOf(HANDLER_CALL);
  const responseIndex = source.indexOf(RESPONSE_CALL);

  return Object.freeze({
    missing: Object.freeze(missing),
    forbidden: Object.freeze(forbidden),
    handlerCallCount,
    ordered:
      decodeIndex !== -1 &&
      handlerIndex !== -1 &&
      responseIndex !== -1 &&
      decodeIndex < handlerIndex &&
      handlerIndex < responseIndex,
  });
}

export const INBOUND_TRANSPORT_ADAPTER_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-433",
    category: "architecture",
    severity: "error",
    title: "Inbound transport adaptation flows only through the V14.0c handler",
    description:
      "The V14.0d adapter boundary must decode once, invoke handleInboundLoopRuntimeRequest exactly once, and map only its closed result; direct access to authentication, security, preparation, or Runtime internals is forbidden.",
    metadata: {
      introducedIn: "V14.0d",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-432"],
    },
    check: () => {
      const source = existsSync(ADAPTER_FILE) ? readFileSync(ADAPTER_FILE, "utf8") : "";
      const result = inspectInboundTransportAdapterGateInvariant(source);
      const details = [
        ...result.missing.map((token) => `${ADAPTER_FILE} -> missing: ${token}`),
        ...result.forbidden.map((token) => `${ADAPTER_FILE} -> forbidden: ${token}`),
        ...(result.handlerCallCount === 1
          ? []
          : [`${ADAPTER_FILE} -> V14.0c handler call count: ${result.handlerCallCount}`]),
        ...(result.ordered
          ? []
          : [`${ADAPTER_FILE} -> expected decode -> handler -> response mapping order`]),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Route every decoded transport request through the V14.0c handler exactly once and map only the resulting redacted closed outcome.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze([ADAPTER_FILE]));
    },
  };

  return rule;
})();
