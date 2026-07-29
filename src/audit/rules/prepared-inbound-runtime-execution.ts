import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const APPLICATION_SERVICE_FILE =
  "src/core/prepared-inbound-runtime-execution.ts";
const CORE_INDEX_FILE = "src/core/index.ts";
const ARCHITECTURE_FILE =
  "docs/architecture/prepared-inbound-runtime-execution.md";

const REQUIRED_SERVICE_TOKENS = Object.freeze([
  "await handleInboundLoopRuntimeRequest(",
  "evaluateRuntimeExecutionAdmission({",
  "dependencies.runtimeResolver ?? resolveRuntime",
  'if (prepared.mode === "dry-run") {',
  "await invokeAdapter(selection.adapter, runtimeRequest)",
  "runtimeInvoked: true as const",
  "effectStarted: didEffectStart(result)",
]);

const FORBIDDEN_SERVICE_TOKENS = Object.freeze([
  "decodeLoopRuntimePublicRequest(",
  "evaluateInboundAuthenticationVerifier(",
  "evaluateInboundReplayProtection(",
  "authorizeLoopRuntimePublicRequest(",
  "prepareAuthorizedLoopRuntimeRequest(",
  "process.env",
  "node:child_process",
  "fetch(",
]);

export function inspectPreparedInboundRuntimeExecutionInvariant(
  serviceSource: string,
  coreIndexSource: string,
  architectureSource: string,
): Readonly<{
  missing: readonly string[];
  forbidden: readonly string[];
  dryRunBeforeInvocation: boolean;
}> {
  const missing = [
    ...REQUIRED_SERVICE_TOKENS.filter(
      (token) => !sourceIncludesToken(serviceSource, token),
    ).map((token) => `${APPLICATION_SERVICE_FILE} -> missing: ${token}`),
    ...(!sourceIncludesToken(
      coreIndexSource,
      'export * from "./prepared-inbound-runtime-execution.js";',
    )
      ? [`${CORE_INDEX_FILE} -> missing V14.3 Core export`]
      : []),
    ...(!sourceIncludesToken(
      architectureSource,
      "# Prepared Inbound Runtime Execution",
    )
      ? [`${ARCHITECTURE_FILE} -> missing architecture contract`]
      : []),
  ];
  const forbidden = FORBIDDEN_SERVICE_TOKENS.filter((token) =>
    sourceIncludesToken(serviceSource, token),
  );
  const dryRunIndex = serviceSource.indexOf(
    'if (prepared.mode === "dry-run") {',
  );
  const invocationIndex = serviceSource.indexOf(
    "await invokeAdapter(selection.adapter, runtimeRequest)",
  );

  return Object.freeze({
    missing: Object.freeze(missing),
    forbidden: Object.freeze(forbidden),
    dryRunBeforeInvocation:
      dryRunIndex !== -1 &&
      invocationIndex !== -1 &&
      dryRunIndex < invocationIndex,
  });
}

export const PREPARED_INBOUND_RUNTIME_EXECUTION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-494",
    category: "architecture",
    severity: "error",
    title: "Prepared inbound requests reach the guarded Runtime boundary",
    description:
      "The V14.3 Core application service must reuse the existing inbound handler, apply Runtime admission, keep dry-run non-invoking, resolve exactly one Runtime boundary, expose a redacted receipt, and remain free of direct lower-level authentication/replay/authorization preparation or ambient effects.",
    metadata: {
      introducedIn: "V14.3",
      tags: ["architecture", "contract", "execution", "policy", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-430", "AUDIT-431", "AUDIT-423"],
    },
    check: () => {
      const serviceSource = existsSync(APPLICATION_SERVICE_FILE)
        ? readFileSync(APPLICATION_SERVICE_FILE, "utf8")
        : "";
      const coreIndexSource = existsSync(CORE_INDEX_FILE)
        ? readFileSync(CORE_INDEX_FILE, "utf8")
        : "";
      const architectureSource = existsSync(ARCHITECTURE_FILE)
        ? readFileSync(ARCHITECTURE_FILE, "utf8")
        : "";
      const result = inspectPreparedInboundRuntimeExecutionInvariant(
        serviceSource,
        coreIndexSource,
        architectureSource,
      );
      const details = [
        ...result.missing,
        ...result.forbidden.map(
          (token) => `${APPLICATION_SERVICE_FILE} -> forbidden: ${token}`,
        ),
        ...(result.dryRunBeforeInvocation
          ? []
          : [
              `${APPLICATION_SERVICE_FILE} -> dry-run must return before Runtime invocation`,
            ]),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Keep V14.3 as one Core application-service boundary: delegate inbound gates, admit the prepared request, return before adapter invocation for dry-run, and expose only stable redacted plan/receipt data.",
          )
        : pass(
            rule,
            `${rule.title}.`,
            Object.freeze([
              APPLICATION_SERVICE_FILE,
              CORE_INDEX_FILE,
              ARCHITECTURE_FILE,
            ]),
          );
    },
  };

  return rule;
})();
