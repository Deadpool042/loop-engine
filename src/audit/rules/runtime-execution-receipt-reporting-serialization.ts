import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

export type RuntimeExecutionReceiptReportingSerializationInvariant = Readonly<{
  file: string;
  requiredTokens: readonly string[];
  forbiddenTokens: readonly string[];
}>;

export const RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_INVARIANTS =
  Object.freeze({
    projection: Object.freeze({
      file: "src/core/runtime-execution-receipt-reporting-serialization.ts",
      requiredTokens: Object.freeze([
        "RUNTIME_EXECUTION_RECEIPT_REPORTING_RESULT_SCHEMA_VERSION",
        "RuntimeExecutionReceiptReportingPublicResult",
        "projectRuntimeExecutionReceiptReportingResult",
        "serializeRuntimeExecutionReceiptReportingResult",
        "schemaVersion:",
        "outcome: result.outcome",
        "report: result.report",
        "diagnosticCodes:",
      ]),
      forbiddenTokens: Object.freeze([
        "runtimeResult: result.runtimeResult",
        "resolution: result.resolution",
        "diagnostics: result.diagnostics",
        "message: diagnostic.message",
        "details: diagnostic.details",
        "JSON.stringify(result)",
      ]),
    }),
    coreExport: Object.freeze({
      file: "src/core/index.ts",
      requiredTokens: Object.freeze([
        "./runtime-execution-receipt-reporting-serialization.js",
      ]),
      forbiddenTokens: Object.freeze([]),
    }),
    historicalReportingBoundary: Object.freeze({
      file: "src/execution/report.ts",
      requiredTokens: Object.freeze([]),
      forbiddenTokens: Object.freeze([
        "RuntimeExecutionReceiptReportingPublicResult",
        "runtime-execution-receipt-reporting-serialization",
      ]),
    }),
    documentation: Object.freeze({
      file: "docs/architecture/runtime-execution-receipt-reporting.md",
      requiredTokens: Object.freeze([
        "V13.78",
        "projection",
        "diagnosticCodes",
        "RuntimeResult",
      ]),
      forbiddenTokens: Object.freeze([]),
    }),
  }) satisfies Readonly<
    Record<string, RuntimeExecutionReceiptReportingSerializationInvariant>
  >;

export function inspectRuntimeExecutionReceiptReportingSerializationInvariant(
  source: string,
  invariant: RuntimeExecutionReceiptReportingSerializationInvariant,
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

export const RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_RULE: AuditRule =
  (() => {
    const rule: AuditRule = {
      id: "AUDIT-422",
      category: "architecture",
      severity: "error",
      title: "Runtime receipt reporting serialization exposes only the public projection",
      description:
        "V13.78 must serialize only schemaVersion, outcome, report and diagnosticCodes without leaking RuntimeResult, resolution or diagnostic internals.",
      metadata: {
        introducedIn: "V13.79",
        tags: ["architecture", "contract", "execution", "json"],
        stability: "stable",
        dependsOn: ["AUDIT-421"],
      },
      check: () => {
        const details: string[] = [];
        const files: string[] = [];

        for (const invariant of Object.values(
          RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_INVARIANTS,
        )) {
          files.push(invariant.file);
          const source = existsSync(invariant.file)
            ? readFileSync(invariant.file, "utf8")
            : "";
          const result =
            inspectRuntimeExecutionReceiptReportingSerializationInvariant(
              source,
              invariant,
            );
          details.push(
            ...result.missing.map(
              (token) => `${invariant.file} -> missing: ${token}`,
            ),
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
              "Restore the V13.78 public serialization whitelist and keep internal runtime execution state out of the serialized boundary.",
            )
          : pass(rule, `${rule.title}.`, Object.freeze(files));
      },
    };

    return rule;
  })();
