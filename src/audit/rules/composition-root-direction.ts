import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const COMPOSITION_ROOT = "src/composition";
const FORBIDDEN_OUTBOUND_LAYERS = Object.freeze(["commands", "ui", "audit"]);

export type CompositionRootDirectionSource = Readonly<{
  path: string;
  source: string;
}>;

export type CompositionRootDirectionViolation = Readonly<{
  path: string;
  target: string;
  reason: "composition_depends_on_inbound_layer";
}>;

const MODULE_SPECIFIER_PATTERN =
  /(?:\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?|\bimport\s*\()\s*["']([^"']+)["']/g;

export function extractCompositionRootModuleSpecifiers(
  source: string,
): readonly string[] {
  const targets: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = MODULE_SPECIFIER_PATTERN.exec(source)) !== null) {
    const target = match[1];
    if (target !== undefined) targets.push(target);
  }

  return Object.freeze(targets);
}

function isForbiddenOutboundTarget(target: string): boolean {
  return FORBIDDEN_OUTBOUND_LAYERS.some(
    (layer) => target === `../${layer}` || target.startsWith(`../${layer}/`),
  );
}

export function inspectCompositionRootDirection(
  files: readonly CompositionRootDirectionSource[],
): readonly CompositionRootDirectionViolation[] {
  const violations: CompositionRootDirectionViolation[] = [];

  for (const file of files) {
    for (const target of extractCompositionRootModuleSpecifiers(file.source)) {
      if (!isForbiddenOutboundTarget(target)) continue;
      violations.push(
        Object.freeze({
          path: file.path,
          target,
          reason: "composition_depends_on_inbound_layer" as const,
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

export const COMPOSITION_ROOT_DIRECTION_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-501",
    category: "architecture",
    severity: "error",
    title: "Composition root dependencies point toward application internals",
    description:
      "Composition modules may assemble Core and infrastructure implementations, but must not depend on CLI commands, UI rendering, or audit machinery.",
    metadata: {
      introducedIn: "V14.11",
      tags: ["architecture", "contract", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-500"],
    },
    check: () => {
      const paths = collectTypeScriptFiles(COMPOSITION_ROOT);
      const files = paths.map((path) =>
        Object.freeze({
          path: relative(".", path).replaceAll("\\", "/"),
          source: readFileSync(path, "utf8"),
        }),
      );
      const violations = inspectCompositionRootDirection(files);

      return violations.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            violations.map(({ path, target }) => `${path} -> ${target}`),
            "Remove inbound CLI, UI, or audit dependencies from src/composition.",
          )
        : pass(rule, `${rule.title}.`, paths);
    },
  };

  return rule;
})();
