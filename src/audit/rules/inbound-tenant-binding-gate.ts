import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/core/inbound-authentication.ts";

const TENANT =
  "principal.tenantId !== input.security.accessRequest.tenantId";
const REPLAY = "evaluateInboundReplayProtection(";

export function inspectInboundTenantBindingGateInvariant(
  source: string,
): Readonly<{ ordered: boolean; replayCallCount: number }> {
  const tenantIndex = source.indexOf(TENANT);
  const replayIndex = source.indexOf(REPLAY);

  return Object.freeze({
    ordered:
      tenantIndex !== -1 &&
      replayIndex !== -1 &&
      tenantIndex < replayIndex,
    replayCallCount: source.split(REPLAY).length - 1,
  });
}

export const INBOUND_TENANT_BINDING_GATE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-449",
    category: "architecture",
    severity: "error",
    title: "Inbound tenant binding precedes replay protection",
    description:
      "The V14.0l authentication boundary must reject tenant mismatch before invoking the injected replay-protection port.",
    metadata: {
      introducedIn: "V14.0l",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-448"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result = inspectInboundTenantBindingGateInvariant(source);

      const details = [
        ...(result.ordered
          ? []
          : [`${FILE} -> invalid tenant binding gate ordering`]),
        ...(result.replayCallCount === 1
          ? []
          : [`${FILE} -> replay call count: ${result.replayCallCount}`]),
      ];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();
