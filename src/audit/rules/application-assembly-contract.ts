import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const ASSEMBLY_FILE = "src/composition/application-assembly.ts";
const CLI_FILE = "src/cli.ts";
const COMMANDS_ROOT = "src/commands";
const CORE_ROOT = "src/core";
const SOURCE_ROOT = "src";
const CONCRETE_PROVIDER_TARGET = "../loop/codex-cli-executor.js";

export type ApplicationAssemblySource = Readonly<{
  path: string;
  source: string;
}>;

export type ApplicationAssemblyViolation = Readonly<{
  path: string;
  target: string;
  reason:
    | "command_bypasses_application_assembly"
    | "core_depends_on_composition"
    | "concrete_provider_wired_outside_assembly";
}>;

const MODULE_SPECIFIER_PATTERN =
  /(?:\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?|\bimport\s*\()\s*["']([^"']+)["']/g;

function moduleSpecifiers(source: string): readonly string[] {
  const targets: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = MODULE_SPECIFIER_PATTERN.exec(source)) !== null) {
    const target = match[1];
    if (target !== undefined) targets.push(target);
  }

  return Object.freeze(targets);
}

function isAllowedCommandTarget(target: string): boolean {
  return (
    !target.startsWith("../") ||
    target === "../composition" ||
    target.startsWith("../composition/") ||
    target === "../ui" ||
    target.startsWith("../ui/")
  );
}

export function inspectApplicationAssemblyContract(
  commandFiles: readonly ApplicationAssemblySource[],
  coreFiles: readonly ApplicationAssemblySource[],
  sourceFiles: readonly ApplicationAssemblySource[],
): readonly ApplicationAssemblyViolation[] {
  const violations: ApplicationAssemblyViolation[] = [];

  for (const file of commandFiles) {
    for (const target of moduleSpecifiers(file.source)) {
      if (isAllowedCommandTarget(target)) continue;
      violations.push(
        Object.freeze({
          path: file.path,
          target,
          reason: "command_bypasses_application_assembly" as const,
        }),
      );
    }
  }

  for (const file of coreFiles) {
    for (const target of moduleSpecifiers(file.source)) {
      if (!target.includes("composition")) continue;
      violations.push(
        Object.freeze({
          path: file.path,
          target,
          reason: "core_depends_on_composition" as const,
        }),
      );
    }
  }

  for (const file of sourceFiles) {
    if (file.path === ASSEMBLY_FILE) continue;
    for (const target of moduleSpecifiers(file.source)) {
      if (target !== CONCRETE_PROVIDER_TARGET) continue;
      violations.push(
        Object.freeze({
          path: file.path,
          target,
          reason: "concrete_provider_wired_outside_assembly" as const,
        }),
      );
    }
  }

  return Object.freeze(violations);
}

function collectTypeScriptFiles(root: string): readonly string[] {
  if (!existsSync(root)) return Object.freeze([]);

  const paths: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && path.endsWith(".ts")) paths.push(path);
    }
  };

  visit(root);
  return Object.freeze(paths.sort());
}

function sources(root: string): readonly ApplicationAssemblySource[] {
  return collectTypeScriptFiles(root).map((path) =>
    Object.freeze({
      path: relative(".", path).replaceAll("\\", "/"),
      source: readFileSync(path, "utf8"),
    }),
  );
}

export const APPLICATION_ASSEMBLY_CONTRACT_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-502",
    category: "architecture",
    severity: "error",
    title: "Application assembly is the single concrete composition boundary",
    description:
      "Commands consume only LoopApplicationAssembly, Core never depends on composition, and concrete provider construction stays inside createLoopApplicationAssembly.",
    metadata: {
      introducedIn: "V14.12",
      tags: ["architecture", "contract", "execution", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-501"],
    },
    check: () => {
      const assemblySource = existsSync(ASSEMBLY_FILE)
        ? readFileSync(ASSEMBLY_FILE, "utf8")
        : "";
      const cliSource = existsSync(CLI_FILE)
        ? readFileSync(CLI_FILE, "utf8")
        : "";
      const required = [
        ["assembly contract", "export type LoopApplicationAssembly ="],
        ["assembly factory", "export function createLoopApplicationAssembly("],
        ["provider construction", "createCodexCliLoopExecutor({"],
        ["immutable assembly", "return Object.freeze({"],
        ["CLI assembly creation", "createLoopApplicationAssembly()"],
      ] as const;
      const missing = required
        .filter(([, token]) =>
          token === "createLoopApplicationAssembly()"
            ? !cliSource.includes(token)
            : !assemblySource.includes(token),
        )
        .map(([label]) => label);
      const violations = inspectApplicationAssemblyContract(
        sources(COMMANDS_ROOT),
        sources(CORE_ROOT),
        sources(SOURCE_ROOT),
      );
      const details = [
        ...missing.map((label) => `${ASSEMBLY_FILE} -> missing ${label}`),
        ...violations.map(
          ({ path, target, reason }) => `${path} -> ${target}: ${reason}`,
        ),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Inject LoopApplicationAssembly into commands and keep all concrete provider wiring inside createLoopApplicationAssembly.",
          )
        : pass(
            rule,
            `${rule.title}.`,
            Object.freeze([ASSEMBLY_FILE, CLI_FILE, COMMANDS_ROOT, CORE_ROOT]),
          );
    },
  };

  return rule;
})();
