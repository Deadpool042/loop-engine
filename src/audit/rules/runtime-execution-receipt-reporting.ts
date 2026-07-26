import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

export type RuntimeExecutionReceiptReportingInvariant = Readonly<{
  file: string;
  requiredTokens: readonly string[];
  forbiddenTokens: readonly string[];
}>;

export const RUNTIME_EXECUTION_RECEIPT_REPORTING_INVARIANTS = Object.freeze({
  report: Object.freeze({
    file: "src/core/runtime-execution-receipt-report.ts",
    requiredTokens: Object.freeze([
      "RUNTIME_EXECUTION_RECEIPT_REPORT_SCHEMA_VERSION",
      "RuntimeExecutionReceiptReport",
      "createRuntimeExecutionReceiptReport",
      "serializeRuntimeExecutionReceiptReport",
      "receipt: RuntimeExecutionReceipt",
    ]),
    forbiddenTokens: Object.freeze([
      "from \"node:child_process\"",
      "fetch(",
      "Date.now",
      "new Date",
      "Math.random",
      "crypto.randomUUID",
      "process.env",
    ]),
  }),
  coreExport: Object.freeze({
    file: "src/core/index.ts",
    requiredTokens: Object.freeze(["./runtime-execution-receipt-report.js"]),
    forbiddenTokens: Object.freeze([]),
  }),
  historicalReportingBoundary: Object.freeze({
    file: "src/execution/report.ts",
    requiredTokens: Object.freeze([]),
    forbiddenTokens: Object.freeze([
      "RuntimeExecutionReceipt",
      "runtime-execution-receipt-report",
    ]),
  }),
  documentation: Object.freeze({
    file: "docs/architecture/runtime-execution-receipt-reporting.md",
    requiredTokens: Object.freeze([
      "V13.75",
      "Runtime Execution Receipt Reporting",
      "opt-in",
      "src/execution",
      "AUDIT-410",
    ]),
    forbiddenTokens: Object.freeze([]),
  }),
}) satisfies Readonly<
  Record<string, RuntimeExecutionReceiptReportingInvariant>
>;

export function inspectRuntimeExecutionReceiptReportingInvariant(
  source: string,
  invariant: RuntimeExecutionReceiptReportingInvariant,
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

export const RUNTIME_EXECUTION_RECEIPT_REPORTING_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-421",
    category: "architecture",
    severity: "error",
    title: "Runtime Execution Receipt reporting stays additive and isolated",
    description:
      "V13.75 must expose a deterministic Core receipt-report envelope without altering historical src/execution reporting.",
    metadata: {
      introducedIn: "V13.76",
      tags: ["architecture", "contract", "execution", "documentation"],
      stability: "stable",
      dependsOn: ["AUDIT-420"],
    },
    check: () => {
      const details: string[] = [];
      const files: string[] = [];

      for (const invariant of Object.values(
        RUNTIME_EXECUTION_RECEIPT_REPORTING_INVARIANTS,
      )) {
        files.push(invariant.file);
        const source = existsSync(invariant.file)
          ? readFileSync(invariant.file, "utf8")
          : "";
        const result = inspectRuntimeExecutionReceiptReportingInvariant(
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
            "Restore the opt-in Core receipt reporting envelope and keep src/execution receipt-free.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze(files));
    },
  };

  return rule;
})();
