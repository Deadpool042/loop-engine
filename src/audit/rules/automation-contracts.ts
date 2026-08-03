import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { fail, pass } from "../findings.js";
import type { AuditRuleDefinition } from "../types.js";
import {
  AUTOMATION_DEPENDENCY_DIRECTION_RULE as BASE_AUTOMATION_DEPENDENCY_DIRECTION_RULE,
  inspectAutomationDependencyDirection as inspectBaseAutomationDependencyDirection,
} from "./automation-contracts-base.js";
import type {
  AutomationAuditSource,
  AutomationAuditViolation,
} from "./automation-contracts-base.js";

export * from "./automation-contracts-base.js";

const AUTOMATION_ROOT = "src/automation";
const BARREL_FILE = "src/automation/index.ts";
const ORCHESTRATOR_BARREL_FILE = "src/automation/orchestrator/index.ts";

const APPROVED_TARGET_REPLACEMENTS = new Map<string, ReadonlyMap<string, string>>([
  [
    BARREL_FILE,
    new Map([
      [
        "./orchestrator/worker-execution-lifecycle-closure-port-types.js",
        "./orchestrator/index.js",
      ],
      [
        "./orchestrator/worker-execution-lifecycle-closure-invocation-types.js",
        "./orchestrator/index.js",
      ],
      [
        "./orchestrator/worker-execution-lifecycle-closure-invocation.js",
        "./orchestrator/index.js",
      ],
    ]),
  ],
  [
    ORCHESTRATOR_BARREL_FILE,
    new Map([
      [
        "./worker-execution-lifecycle-closure-port-types.js",
        "./worker-execution-lifecycle-closure-preparation-types.js",
      ],
      [
        "./worker-execution-lifecycle-closure-invocation-types.js",
        "./worker-execution-lifecycle-closure-preparation-types.js",
      ],
      [
        "./worker-execution-lifecycle-closure-invocation.js",
        "./worker-execution-lifecycle-closure-preparation.js",
      ],
    ]),
  ],
]);

function normalizeApprovedV2110Targets(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditSource[] {
  return Object.freeze(
    sources.map((source) => {
      const replacements = APPROVED_TARGET_REPLACEMENTS.get(source.path);
      if (replacements === undefined) return source;
      let normalized = source.source;
      for (const [target, replacement] of replacements) {
        normalized = normalized.replaceAll(`from \"${target}\";`, `from \"${replacement}\";`);
      }
      return Object.freeze({ path: source.path, source: normalized });
    }),
  );
}

export function inspectAutomationDependencyDirection(
  sources: readonly AutomationAuditSource[],
): readonly AutomationAuditViolation[] {
  return inspectBaseAutomationDependencyDirection(
    normalizeApprovedV2110Targets(sources),
  );
}

function collectAutomationSources(directory: string): readonly AutomationAuditSource[] {
  const sources: AutomationAuditSource[] = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith(".ts")) {
        sources.push(
          Object.freeze({
            path: relative(process.cwd(), absolute).replaceAll("\\", "/"),
            source: readFileSync(absolute, "utf8"),
          }),
        );
      }
    }
  };
  visit(directory);
  return Object.freeze(sources);
}

export const AUTOMATION_DEPENDENCY_DIRECTION_RULE: AuditRuleDefinition =
  Object.freeze({
    ...BASE_AUTOMATION_DEPENDENCY_DIRECTION_RULE,
    check: () => {
      const violations = inspectAutomationDependencyDirection(
        collectAutomationSources(AUTOMATION_ROOT),
      );
      const details = violations.map(
        ({ path, reason }) => `${path}: ${reason}`,
      );
      return violations.length === 0
        ? pass(
            AUTOMATION_DEPENDENCY_DIRECTION_RULE,
            "Automation contract dependency direction is preserved.",
          )
        : fail(
            AUTOMATION_DEPENDENCY_DIRECTION_RULE,
            "Automation contract dependency direction is violated.",
            details,
            "Keep Automation dependencies within their declared architectural direction.",
          );
    },
  });
