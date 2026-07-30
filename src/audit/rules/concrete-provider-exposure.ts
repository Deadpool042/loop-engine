import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const REVIEWED_COMPOSITION_FILE = "src/composition/application-assembly.ts";
const PUBLIC_BARREL_FILES = Object.freeze([
  "src/core/index.ts",
  "src/loop/index.ts",
  "src/runtime/index.ts",
]);
const CONCRETE_PROVIDER_TARGETS = Object.freeze([
  "../loop/codex-cli-executor.js",
  "./codex-cli-executor.js",
]);

export type ProviderExposureSource = Readonly<{
  path: string;
  source: string;
}>;

export type ProviderExposureViolation = Readonly<{
  path: string;
  target: string;
  reason:
    "concrete_provider_publicly_exposed" | "unreviewed_provider_composition";
}>;

const MODULE_SPECIFIER_PATTERN =
  /(?:\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?|\bimport\s*\()\s*["']([^"']+)["']/g;

export function extractProviderModuleSpecifiers(
  source: string,
): readonly string[] {
  const specifiers: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = MODULE_SPECIFIER_PATTERN.exec(source)) !== null) {
    const target = match[1];
    if (target !== undefined) specifiers.push(target);
  }

  return Object.freeze(specifiers);
}

function isConcreteProviderTarget(target: string): boolean {
  return CONCRETE_PROVIDER_TARGETS.includes(target);
}

export function inspectConcreteProviderExposure(
  files: readonly ProviderExposureSource[],
): readonly ProviderExposureViolation[] {
  const violations: ProviderExposureViolation[] = [];

  for (const file of files) {
    for (const target of extractProviderModuleSpecifiers(file.source)) {
      if (!isConcreteProviderTarget(target)) continue;

      if (PUBLIC_BARREL_FILES.includes(file.path)) {
        violations.push(
          Object.freeze({
            path: file.path,
            target,
            reason: "concrete_provider_publicly_exposed" as const,
          }),
        );
      } else if (file.path !== REVIEWED_COMPOSITION_FILE) {
        violations.push(
          Object.freeze({
            path: file.path,
            target,
            reason: "unreviewed_provider_composition" as const,
          }),
        );
      }
    }
  }

  return Object.freeze(violations);
}

export const CONCRETE_PROVIDER_EXPOSURE_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-499",
    category: "architecture",
    severity: "error",
    title: "Concrete providers stay behind the reviewed composition boundary",
    description:
      "Public barrels must expose provider ports and contracts only, while executable provider construction remains confined to the explicit composition root.",
    metadata: {
      introducedIn: "V14.8",
      tags: ["architecture", "contract", "execution", "policy", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-498"],
    },
    check: () => {
      const paths = Object.freeze([
        ...PUBLIC_BARREL_FILES,
        REVIEWED_COMPOSITION_FILE,
      ]);
      const files = paths
        .filter((path) => existsSync(path))
        .map((path) =>
          Object.freeze({ path, source: readFileSync(path, "utf8") }),
        );
      const violations = inspectConcreteProviderExposure(files);

      return violations.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            violations.map(
              ({ path, target, reason }) => `${path} -> ${target}: ${reason}`,
            ),
            `Remove executable provider exports from public barrels and compose providers only in ${REVIEWED_COMPOSITION_FILE}.`,
          )
        : pass(rule, `${rule.title}.`, paths);
    },
  };

  return rule;
})();
