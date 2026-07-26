import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

export type RuntimeExecutionPublicResultFacadeInvariant = Readonly<{
  file: string;
  requiredTokens: readonly string[];
  forbiddenTokens: readonly string[];
}>;

export const RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_INVARIANTS = Object.freeze({
  facade: Object.freeze({
    file: "src/core/runtime-execution-public-result-facade.ts",
    requiredTokens: Object.freeze([
      "RuntimeExecutionPublicResultFacade",
      "finalizeRuntimeExecutionPublicResult",
      "executePolicyAwareDeclarativeRuntimePublicResult",
      "executePolicyAwareDeclarativeRuntimeWithReceiptReport(input)",
      "projectRuntimeExecutionReceiptReportingResult(integrated)",
      "serializeRuntimeExecutionReceiptReportingResult(integrated)",
      "result: RuntimeExecutionReceiptReportingPublicResult",
      "serialized: string",
    ]),
    forbiddenTokens: Object.freeze([
      "return integrated",
      "runtimeResult: integrated.runtimeResult",
      "resolution: integrated.resolution",
      "receipt: integrated.receipt",
      "diagnostics: integrated.diagnostics",
      "JSON.stringify(integrated)",
    ]),
  }),
  coreExport: Object.freeze({
    file: "src/core/index.ts",
    requiredTokens: Object.freeze(["./runtime-execution-public-result-facade.js"]),
    forbiddenTokens: Object.freeze([]),
  }),
  historicalReportingBoundary: Object.freeze({
    file: "src/execution/report.ts",
    requiredTokens: Object.freeze([]),
    forbiddenTokens: Object.freeze([
      "RuntimeExecutionPublicResultFacade",
      "runtime-execution-public-result-facade",
    ]),
  }),
  documentation: Object.freeze({
    file: "docs/architecture/runtime-execution-receipt-reporting.md",
    requiredTokens: Object.freeze([
      "V13.80",
      "executePolicyAwareDeclarativeRuntimePublicResult",
      "result",
      "serialized",
      "RuntimeResult",
    ]),
    forbiddenTokens: Object.freeze([]),
  }),
}) satisfies Readonly<Record<string, RuntimeExecutionPublicResultFacadeInvariant>>;

export function inspectRuntimeExecutionPublicResultFacadeInvariant(
  source: string,
  invariant: RuntimeExecutionPublicResultFacadeInvariant,
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

export const RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-423",
    category: "architecture",
    severity: "error",
    title: "Runtime execution public result facade preserves the public-only boundary",
    description:
      "V13.80 must compose execution, receipt reporting and public serialization without exposing integrated Runtime execution state.",
    metadata: {
      introducedIn: "V13.81",
      tags: ["architecture", "contract", "execution", "json"],
      stability: "stable",
      dependsOn: ["AUDIT-422"],
    },
    check: () => {
      const details: string[] = [];
      const files: string[] = [];

      for (const invariant of Object.values(
        RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_INVARIANTS,
      )) {
        files.push(invariant.file);
        const source = existsSync(invariant.file)
          ? readFileSync(invariant.file, "utf8")
          : "";
        const result = inspectRuntimeExecutionPublicResultFacadeInvariant(
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
            "Restore the V13.80 public-result facade composition and keep internal Runtime execution state out of the facade output.",
          )
        : pass(rule, `${rule.title}.`, Object.freeze(files));
    },
  };

  return rule;
})();
