import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const COMMANDS_ROOT = "src/commands";
const FORBIDDEN_INTERNAL_LAYERS = Object.freeze([
  "audit",
  "loop",
  "execution",
  "intelligence",
  "policy",
  "context",
]);

export type CliCommandBoundarySource = Readonly<{
  path: string;
  source: string;
}>;

export type CliCommandBoundaryViolation = Readonly<{
  path: string;
  target: string;
  reason: "command_bypasses_core_boundary";
}>;

const MODULE_SPECIFIER_PATTERN =
  /(?:\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?|\bimport\s*\()\s*["']([^"']+)["']/g;

export function extractCliCommandModuleSpecifiers(source: string): readonly string[] {
  const targets: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = MODULE_SPECIFIER_PATTERN.exec(source)) !== null) {
    const target = match[1];
    if (target !== undefined) targets.push(target);
  }

  return Object.freeze(targets);
}

function isForbiddenInternalTarget(target: string): boolean {
  return FORBIDDEN_INTERNAL_LAYERS.some(
    (layer) => target === `../${layer}` || target.startsWith(`../${layer}/`),
  );
}

export function inspectCliCommandBoundary(
  files: readonly CliCommandBoundarySource[],
): readonly CliCommandBoundaryViolation[] {
  const violations: CliCommandBoundaryViolation[] = [];

  for (const file of files) {
    for (const target of extractCliCommandModuleSpecifiers(file.source)) {
      if (!isForbiddenInternalTarget(target)) continue;
      violations.push(
        Object.freeze({
          path: file.path,
          target,
          reason: "command_bypasses_core_boundary" as const,
        }),
      );
    }
  }

  return Object.freeze(violations);
}

function collectTypeScriptFiles(root: string): readonly string[] {
  if (!existsSync(root)) return Object.freeze([]);

  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && path.endsWith(".ts")) files.push(path);
    }
  };

  visit(root);
  return Object.freeze(files.sort());
}

export const CLI_COMMAND_BOUNDARY_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-500",
    category: "architecture",
    severity: "error",
    title: "CLI commands stay behind the Core boundary",
    description:
      "CLI command modules may depend on Core, UI, composition roots, and local command modules, but never directly on internal implementation layers.",
    metadata: {
      introducedIn: "V14.9",
      tags: ["architecture", "contract", "execution", "policy", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-499"],
    },
    check: () => {
      const paths = collectTypeScriptFiles(COMMANDS_ROOT);
      const files = paths.map((path) =>
        Object.freeze({
          path: relative(".", path).replaceAll("\\", "/"),
          source: readFileSync(path, "utf8"),
        }),
      );
      const violations = inspectCliCommandBoundary(files);

      return violations.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            violations.map(({ path, target }) => `${path} -> ${target}`),
            "Route command behavior through src/core or an explicit src/composition root.",
          )
        : pass(rule, `${rule.title}.`, paths);
    },
  };

  return rule;
})();
