import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const ADAPTER_FILE = "src/core/inbound-transport.ts";

const REQUIRED_TOKENS = Object.freeze([
  "export type InboundTransportAdapter = Readonly<{",
  "decode(input: unknown): unknown | Promise<unknown>;",
  "mapResponse(",
  "export type InboundTransportResponse = Readonly<{",
  "export async function handleInboundTransportRequest(",
]);

const FORBIDDEN_TOKENS = Object.freeze([
  "node:http",
  "node:https",
  "node:net",
  "fetch(",
  "express",
  "fastify",
  "socket.io",
  "amqplib",
  "kafkajs",
  "process.env",
  "node:child_process",
]);

export function inspectInboundTransportAdapterNeutralityInvariant(
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

export const INBOUND_TRANSPORT_ADAPTER_NEUTRALITY_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-432",
    category: "architecture",
    severity: "error",
    title: "Inbound transport adapter port stays protocol neutral",
    description:
      "The V14.0d port must model only opaque decode and abstract response mapping around the V14.0c handler, with no HTTP, webhook, socket, queue client, process, network, framework, or concrete transport implementation.",
    metadata: {
      introducedIn: "V14.0d",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-431"],
    },
    check: () => {
      const source = existsSync(ADAPTER_FILE) ? readFileSync(ADAPTER_FILE, "utf8") : "";
      const result = inspectInboundTransportAdapterNeutralityInvariant(source);
      const details = [
        ...result.missing.map((token) => `${ADAPTER_FILE} -> missing: ${token}`),
        ...result.forbidden.map((token) => `${ADAPTER_FILE} -> forbidden: ${token}`),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Keep V14.0d limited to an injected decode/response-mapping port and abstract response contract; concrete protocols and I/O belong in later adapters.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze([ADAPTER_FILE]));
    },
  };

  return rule;
})();
