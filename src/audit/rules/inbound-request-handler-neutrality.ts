import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const HANDLER_FILE = "src/core/inbound.ts";

const REQUIRED_TOKENS = Object.freeze([
  "export type InboundLoopRuntimeRequestEnvelope = Readonly<{",
  "export async function handleInboundLoopRuntimeRequest(",
  "export function validateInboundLoopRuntimeRequestEnvelope(",
]);

const FORBIDDEN_TOKENS = Object.freeze([
  "http.method",
  "req.headers",
  "res.status",
  "express(",
  "fastify(",
  "koa(",
  "hono(",
  "http.IncomingMessage",
  "http.ServerResponse",
  "createServer(",
  ".listen(",
  "req.cookies",
  "res.cookie(",
  "remoteAddress",
  "req.ip",
  "queueConsumer",
  "node:child_process",
  "node:http",
  "node:https",
  "node:net",
  "node:dgram",
  "fetch(",
]);

export function inspectInboundRequestHandlerNeutralityInvariant(
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

export const INBOUND_REQUEST_HANDLER_NEUTRALITY_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-430",
    category: "architecture",
    severity: "error",
    title: "Transport-neutral inbound handler remains protocol-independent and non-operational",
    description:
      "The V14.0c Core application handler must expose a transport-neutral envelope and entrypoint free of any HTTP/webhook/socket/queue/framework concept — no route, listener, header, cookie, or concrete transport transport dependency.",
    metadata: {
      introducedIn: "V14.0c",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-429"],
    },
    check: () => {
      const source = existsSync(HANDLER_FILE) ? readFileSync(HANDLER_FILE, "utf8") : "";
      const result = inspectInboundRequestHandlerNeutralityInvariant(source);
      const details = [
        ...result.missing.map((token) => `${HANDLER_FILE} -> missing: ${token}`),
        ...result.forbidden.map((token) => `${HANDLER_FILE} -> forbidden: ${token}`),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Keep the inbound envelope and handler free of any transport-specific concept; only a future adapter may translate a concrete protocol into this neutral shape.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze([HANDLER_FILE]));
    },
  };

  return rule;
})();
