import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const CORE_DIRECTORY = "src/core";
const CONCRETE_FACADE_FILE =
  "src/core/configured-inbound-security-adapter.ts";

const ALLOWED_FACADE_TARGETS = Object.freeze([
  "../inbound-adapters/configured-inbound-adapter.js",
  "../inbound-security/configured-api-key.js",
  "../inbound-security/configured-acl.js",
  "../inbound-security/file-replay-protection.js",
]);

const CONCRETE_TARGET_PREFIXES = Object.freeze([
  "../inbound-adapters/",
  "../inbound-security/configured-",
  "../inbound-security/file-",
]);

export type CoreSourceFile = Readonly<{
  path: string;
  source: string;
}>;

export type CoreDependencyViolation = Readonly<{
  path: string;
  target: string;
  reason: "concrete_dependency_outside_facade" | "unapproved_facade_target";
}>;

const MODULE_SPECIFIER_PATTERN =
  /(?:\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?|\bimport\s*\()\s*["']([^"']+)["']/g;

export function extractModuleSpecifiers(source: string): readonly string[] {
  const specifiers: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = MODULE_SPECIFIER_PATTERN.exec(source)) !== null) {
    const target = match[1];
    if (target !== undefined) {
      specifiers.push(target);
    }
  }

  return Object.freeze(specifiers);
}

function isConcreteTarget(target: string): boolean {
  return CONCRETE_TARGET_PREFIXES.some((prefix) => target.startsWith(prefix));
}

export function inspectCoreConcreteDependencyDirection(
  files: readonly CoreSourceFile[],
): readonly CoreDependencyViolation[] {
  const violations: CoreDependencyViolation[] = [];

  for (const file of files) {
    for (const target of extractModuleSpecifiers(file.source)) {
      if (!isConcreteTarget(target)) {
        continue;
      }

      if (file.path !== CONCRETE_FACADE_FILE) {
        violations.push(
          Object.freeze({
            path: file.path,
            target,
            reason: "concrete_dependency_outside_facade" as const,
          }),
        );
        continue;
      }

      if (!ALLOWED_FACADE_TARGETS.includes(target)) {
        violations.push(
          Object.freeze({
            path: file.path,
            target,
            reason: "unapproved_facade_target" as const,
          }),
        );
      }
    }
  }

  return Object.freeze(violations);
}

function collectTypeScriptFiles(directory: string): readonly string[] {
  if (!existsSync(directory)) {
    return Object.freeze([]);
  }

  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
    } else if (entry.isFile() && path.endsWith(".ts")) {
      files.push(path.split(sep).join("/"));
    }
  }

  return Object.freeze(files.sort());
}

export const CORE_CONCRETE_DEPENDENCY_DIRECTION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-498",
    category: "architecture",
    severity: "error",
    title: "Core depends on contracts instead of concrete adapters",
    description:
      "Core modules must not depend on concrete inbound adapters or configured security implementations except through the single reviewed compatibility facade.",
    metadata: {
      introducedIn: "V14.7",
      tags: ["architecture", "dependencies", "core", "adapters", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-496", "AUDIT-497"],
    },
    check: () => {
      const files = collectTypeScriptFiles(CORE_DIRECTORY).map((path) =>
        Object.freeze({ path, source: readFileSync(path, "utf8") }),
      );
      const violations = inspectCoreConcreteDependencyDirection(files);

      return violations.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            violations.map(
              ({ path, target, reason }) => `${path} -> ${target}: ${reason}`,
            ),
            `Move concrete composition behind ${CONCRETE_FACADE_FILE}, depend on ports or contract types elsewhere, and explicitly review every facade target.`,
          )
        : pass(
            rule,
            `${rule.title}.`,
            Object.freeze([
              CORE_DIRECTORY,
              CONCRETE_FACADE_FILE,
              ...ALLOWED_FACADE_TARGETS,
            ]),
          );
    },
  };

  return rule;
})();
