import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const CREDENTIAL_FILE = "src/inbound-security/configured-api-key.ts";
const ACL_FILE = "src/inbound-security/configured-acl.ts";
const REPLAY_FILE = "src/inbound-security/file-replay-protection.ts";
const ADAPTER_FILE = "src/inbound-adapters/configured-inbound-adapter.ts";
const CORE_EXPORT_FILE = "src/core/configured-inbound-security-adapter.ts";
const ARCHITECTURE_FILE =
  "docs/architecture/configured-inbound-security-adapter.md";

const REQUIRED_CREDENTIAL_TOKENS = Object.freeze([
  'CONFIGURED_API_KEY_METHOD = "api-key-sha256"',
  "timingSafeEqual",
  "hashConfiguredApiKeySecret",
  "deriveConfiguredApiKeyEvidenceId",
  "record.subjectId === record.principal.principalId",
]);
const REQUIRED_ACL_TOKENS = Object.freeze([
  "tenant_not_authorized",
  "role_not_authorized",
  "project_not_authorized",
  "operation_not_authorized",
  "rule.requiredRoles.every",
  "candidate.operations.includes(input.operation)",
]);
const REQUIRED_REPLAY_TOKENS = Object.freeze([
  'openSync(claimPath, "wx", 0o600)',
  "mkdirSync(directory, { recursive: true, mode: 0o700 })",
  "createHash(\"sha256\")",
  "claimedAt: input.evaluatedAt",
]);
const REQUIRED_ADAPTER_TOKENS = Object.freeze([
  "validateConfiguredApiKeyCredentialRecords",
  "validateConfiguredInboundAclRules",
  "createFileInboundReplayProtectionPort",
  "createConfiguredApiKeyVerifier",
  "executePreparedInboundRuntimeRequest(envelope",
  "runtimeResolver: dependencies.runtimeResolver",
  "allowedOperations: Object.freeze(",
  'stage: "acl" as const',
]);
const FORBIDDEN_TOKENS = Object.freeze([
  "process.env",
  "node:http",
  "node:https",
  "createServer(",
  "fetch(",
  "resolveRuntime",
  "git commit",
  "git push",
]);

function countOccurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

export function inspectConfiguredInboundSecurityAdapterInvariant(
  credentialSource: string,
  aclSource: string,
  replaySource: string,
  adapterSource: string,
  coreExportSource: string,
  architectureSource: string,
): Readonly<{
  missing: readonly string[];
  forbidden: readonly string[];
  applicationServiceCallCount: number;
}> {
  const missing = [
    ...REQUIRED_CREDENTIAL_TOKENS.filter(
      (token) => !sourceIncludesToken(credentialSource, token),
    ).map((token) => `${CREDENTIAL_FILE} -> missing: ${token}`),
    ...REQUIRED_ACL_TOKENS.filter(
      (token) => !sourceIncludesToken(aclSource, token),
    ).map((token) => `${ACL_FILE} -> missing: ${token}`),
    ...REQUIRED_REPLAY_TOKENS.filter(
      (token) => !sourceIncludesToken(replaySource, token),
    ).map((token) => `${REPLAY_FILE} -> missing: ${token}`),
    ...REQUIRED_ADAPTER_TOKENS.filter(
      (token) => !sourceIncludesToken(adapterSource, token),
    ).map((token) => `${ADAPTER_FILE} -> missing: ${token}`),
    ...(!sourceIncludesToken(
      coreExportSource,
      "executeConfiguredInboundAdapterRequest",
    )
      ? [`${CORE_EXPORT_FILE} -> missing V14.5 Core export`]
      : []),
    ...(!sourceIncludesToken(
      architectureSource,
      "# Configured Inbound Security and Adapter Pilot",
    )
      ? [`${ARCHITECTURE_FILE} -> missing architecture contract`]
      : []),
  ];
  const combinedNonReplaySource = [
    credentialSource,
    aclSource,
    adapterSource,
  ].join("\n");
  const forbidden = FORBIDDEN_TOKENS.filter((token) =>
    sourceIncludesToken(combinedNonReplaySource, token),
  );

  return Object.freeze({
    missing: Object.freeze(missing),
    forbidden: Object.freeze(forbidden),
    applicationServiceCallCount: countOccurrences(
      adapterSource,
      "executePreparedInboundRuntimeRequest(envelope",
    ),
  });
}

export const CONFIGURED_INBOUND_SECURITY_ADAPTER_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-496",
    category: "architecture",
    severity: "error",
    title: "Configured inbound security adapter preserves concrete trust boundaries",
    description:
      "The V14.5 pilot must bind configured API-key identity, explicit tenant/role/project/operation ACL, atomic persistent replay claims and one adapter delegation without provider, Runtime or credential discovery.",
    metadata: {
      introducedIn: "V14.5",
      tags: ["architecture", "contract", "security", "execution", "policy"],
      stability: "stable",
      dependsOn: ["AUDIT-494", "AUDIT-495"],
    },
    check: () => {
      const credentialSource = existsSync(CREDENTIAL_FILE)
        ? readFileSync(CREDENTIAL_FILE, "utf8")
        : "";
      const aclSource = existsSync(ACL_FILE) ? readFileSync(ACL_FILE, "utf8") : "";
      const replaySource = existsSync(REPLAY_FILE)
        ? readFileSync(REPLAY_FILE, "utf8")
        : "";
      const adapterSource = existsSync(ADAPTER_FILE)
        ? readFileSync(ADAPTER_FILE, "utf8")
        : "";
      const coreExportSource = existsSync(CORE_EXPORT_FILE)
        ? readFileSync(CORE_EXPORT_FILE, "utf8")
        : "";
      const architectureSource = existsSync(ARCHITECTURE_FILE)
        ? readFileSync(ARCHITECTURE_FILE, "utf8")
        : "";
      const result = inspectConfiguredInboundSecurityAdapterInvariant(
        credentialSource,
        aclSource,
        replaySource,
        adapterSource,
        coreExportSource,
        architectureSource,
      );
      const details = [
        ...result.missing,
        ...result.forbidden.map(
          (token) => `${ADAPTER_FILE} boundary -> forbidden: ${token}`,
        ),
        ...(result.applicationServiceCallCount === 1
          ? []
          : [
              `${ADAPTER_FILE} -> expected one V14.3 application-service call site, found ${result.applicationServiceCallCount}`,
            ]),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Keep V14.5 as one configured fail-closed vertical: derive identity from explicit key records, require exact ACL admission, claim replay atomically, delegate once to V14.3, and infer no provider or Runtime.",
          )
        : pass(
            rule,
            `${rule.title}.`,
            Object.freeze([
              CREDENTIAL_FILE,
              ACL_FILE,
              REPLAY_FILE,
              ADAPTER_FILE,
              CORE_EXPORT_FILE,
              ARCHITECTURE_FILE,
            ]),
          );
    },
  };

  return rule;
})();
