import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const RUNNER_FILE = "src/loop/execute-runner.ts";
const PORTS_FILE = "src/loop/execution.ts";
const CORE_INDEX_FILE = "src/core/index.ts";
const COMMAND_FILE = "src/commands/run.ts";
const ARCHITECTURE_FILE =
  "docs/architecture/looprunner-execute-validation-repair.md";

const REQUIRED_RUNNER_TOKENS = Object.freeze([
  'mode: "execute"',
  'mode: "execute",',
  'agentPolicy.status !== "resolved"',
  "agentPolicy.selectionRequest.budgetCeiling?.maxRepairs",
  "Math.min(dependencies.maxRepairs, policyRepairCeiling)",
  "await dependencies.executor(",
  'transition("validating"',
  'transition("repairing"',
  "repairAttempts >= effectiveMaxRepairs",
  "maxRepairs: effectiveMaxRepairs",
  "commit: null",
  "publication: null",
]);

const FORBIDDEN_RUNNER_TOKENS = Object.freeze([
  "node:child_process",
  "process.env",
  "fetch(",
  "git commit",
  "git push",
  "git tag",
  "reset --hard",
]);

function countOccurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

export function inspectLoopRunnerExecuteInvariant(
  runnerSource: string,
  portsSource: string,
  coreIndexSource: string,
  commandSource: string,
  architectureSource: string,
): Readonly<{
  missing: readonly string[];
  forbidden: readonly string[];
  executorCallCount: number;
  repairBeforeRevalidation: boolean;
}> {
  const missing = [
    ...REQUIRED_RUNNER_TOKENS.filter(
      (token) => !sourceIncludesToken(runnerSource, token),
    ).map((token) => `${RUNNER_FILE} -> missing: ${token}`),
    ...(!sourceIncludesToken(portsSource, "export type LoopExecutor =")
      ? [`${PORTS_FILE} -> missing LoopExecutor port`]
      : []),
    ...(!sourceIncludesToken(portsSource, "export type LoopValidator =")
      ? [`${PORTS_FILE} -> missing LoopValidator port`]
      : []),
    ...(!sourceIncludesToken(portsSource, "export type LoopRepairer =")
      ? [`${PORTS_FILE} -> missing LoopRepairer port`]
      : []),
    ...(!sourceIncludesToken(
      coreIndexSource,
      'export * from "./loop-execution-cycle.js";',
    )
      ? [`${CORE_INDEX_FILE} -> missing V14.4 Core export`]
      : []),
    ...(!sourceIncludesToken(commandSource, "await runLoopExecute(")
      ? [`${COMMAND_FILE} -> execute mode is not routed`]
      : []),
    ...(!sourceIncludesToken(commandSource, "await runLoopPublish(")
      ? [`${COMMAND_FILE} -> publish boundary is not explicit`]
      : []),
    ...(!sourceIncludesToken(
      architectureSource,
      "# LoopRunner Execute, Validation and Repair Cycle",
    )
      ? [`${ARCHITECTURE_FILE} -> missing architecture contract`]
      : []),
  ];
  const forbidden = FORBIDDEN_RUNNER_TOKENS.filter((token) =>
    sourceIncludesToken(runnerSource, token),
  );
  const repairIndex = runnerSource.search(
    /transition\(\s*"repairing",\s*"repairing",\s*"completed"/,
  );
  const followingValidationIndex = runnerSource.search(
    /transition\(\s*"validating",\s*"validating",\s*"completed",\s*repairResult\.details\)/,
  );

  return Object.freeze({
    missing: Object.freeze(missing),
    forbidden: Object.freeze(forbidden),
    executorCallCount: countOccurrences(
      runnerSource,
      "await dependencies.executor(",
    ),
    repairBeforeRevalidation:
      repairIndex !== -1 &&
      followingValidationIndex !== -1 &&
      repairIndex < followingValidationIndex,
  });
}

export const LOOP_RUNNER_EXECUTE_VALIDATION_REPAIR_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-495",
    category: "architecture",
    severity: "error",
    title:
      "LoopRunner execute mode validates and repairs within a finite budget",
    description:
      "The V14.4 execute runner must require policy admission, call one injected executor, validate after execution, clamp the caller repair request to the resolved policy ceiling, repair only within that effective finite budget, revalidate after repair, report modified files, and never commit or publish itself.",
    metadata: {
      introducedIn: "V14.4",
      tags: ["architecture", "contract", "execution", "policy", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-494", "AUDIT-055"],
    },
    check: () => {
      const runnerSource = existsSync(RUNNER_FILE)
        ? readFileSync(RUNNER_FILE, "utf8")
        : "";
      const portsSource = existsSync(PORTS_FILE)
        ? readFileSync(PORTS_FILE, "utf8")
        : "";
      const coreIndexSource = existsSync(CORE_INDEX_FILE)
        ? readFileSync(CORE_INDEX_FILE, "utf8")
        : "";
      const commandSource = existsSync(COMMAND_FILE)
        ? readFileSync(COMMAND_FILE, "utf8")
        : "";
      const architectureSource = existsSync(ARCHITECTURE_FILE)
        ? readFileSync(ARCHITECTURE_FILE, "utf8")
        : "";
      const result = inspectLoopRunnerExecuteInvariant(
        runnerSource,
        portsSource,
        coreIndexSource,
        commandSource,
        architectureSource,
      );
      const details = [
        ...result.missing,
        ...result.forbidden.map(
          (token) => `${RUNNER_FILE} -> forbidden: ${token}`,
        ),
        ...(result.executorCallCount === 1
          ? []
          : [
              `${RUNNER_FILE} -> expected one executor call site, found ${result.executorCallCount}`,
            ]),
        ...(result.repairBeforeRevalidation
          ? []
          : [`${RUNNER_FILE} -> repair must precede revalidation`]),
      ];

      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Keep V14.4 as one fail-closed execute/validate/repair boundary: admit policy before execution, clamp the requested repair count to the resolved policy ceiling, invoke one injected executor, revalidate after each bounded repair, and leave commit/publication null inside the execute runner; route explicit candidate publication outside it.",
          )
        : pass(
            rule,
            `${rule.title}.`,
            Object.freeze([
              RUNNER_FILE,
              PORTS_FILE,
              CORE_INDEX_FILE,
              COMMAND_FILE,
              ARCHITECTURE_FILE,
            ]),
          );
    },
  };

  return rule;
})();
