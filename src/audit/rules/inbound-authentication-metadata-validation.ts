import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const FILE = "src/inbound-security/authentication-verification.ts";
const METADATA_VALIDATION =
  "isNonEmptyStringRecord(descriptors.metadata.value)";

const REQUIRED = Object.freeze([
  "function isNonEmptyStringRecord(",
  "isNonEmptyString(key)",
  "isNonEmptyString(descriptor.value)",
]);

export function inspectInboundAuthenticationMetadataValidationInvariant(
  source: string,
): Readonly<{ missing: readonly string[]; validationCallCount: number }> {
  return Object.freeze({
    missing: Object.freeze(
      REQUIRED.filter((token) => !sourceIncludesToken(source, token)),
    ),
    validationCallCount: source.split(METADATA_VALIDATION).length - 1,
  });
}

export const INBOUND_AUTHENTICATION_METADATA_VALIDATION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-488",
    category: "architecture",
    severity: "error",
    title:
      "Inbound authentication metadata entries reject blank keys and values",
    description:
      "The V14.1g authentication boundary must validate both untrusted input metadata and verified evidence metadata as ordinary string records whose present keys and values are non-empty.",
    metadata: {
      introducedIn: "V14.1g",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-487"],
    },
    check: () => {
      const source = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
      const result =
        inspectInboundAuthenticationMetadataValidationInvariant(source);
      const details = [
        ...result.missing.map((token) => `${FILE} -> missing: ${token}`),
        ...(result.validationCallCount === 2
          ? []
          : [
              `${FILE} -> metadata validation call count: ${result.validationCallCount}`,
            ]),
      ];

      return details.length > 0
        ? fail(rule, `${rule.title}.`, details)
        : pass(rule, `${rule.title}.`, Object.freeze([FILE]));
    },
  };

  return rule;
})();
