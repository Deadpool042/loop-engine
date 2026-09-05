import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  LOOP_RUNNER_EXECUTE_VALIDATION_REPAIR_RULE,
  inspectLoopRunnerExecuteInvariant,
} from "../../src/audit/rules/looprunner-execute-validation-repair.js";

const RUNNER_FILE = "src/loop/execute-runner.ts";
const PORTS_FILE = "src/loop/execution.ts";
const CORE_INDEX_FILE = "src/core/index.ts";
const COMMAND_FILE = "src/commands/run.ts";
const ARCHITECTURE_FILE =
  "docs/architecture/looprunner-execute-validation-repair.md";

function inspect(runnerSource: string) {
  return inspectLoopRunnerExecuteInvariant(
    runnerSource,
    readFileSync(PORTS_FILE, "utf8"),
    readFileSync(CORE_INDEX_FILE, "utf8"),
    readFileSync(COMMAND_FILE, "utf8"),
    readFileSync(ARCHITECTURE_FILE, "utf8"),
  );
}

describe("LoopRunner execute validation repair audit", () => {
  it("registers AUDIT-495 and passes against the delivered boundary", () => {
    assert.equal(LOOP_RUNNER_EXECUTE_VALIDATION_REPAIR_RULE.id, "AUDIT-495");
    assert.equal(
      LOOP_RUNNER_EXECUTE_VALIDATION_REPAIR_RULE.check().status,
      "pass",
    );
  });

  it("detects a third executor call site and forbidden effects", () => {
    const runner = readFileSync(RUNNER_FILE, "utf8");
    const result = inspect(
      `${runner}\nawait dependencies.executor({});\nprocess.env.SECRET;`,
    );

    assert.equal(result.executorCallCount, 3);
    assert.deepEqual(result.forbidden, ["process.env"]);
  });

  it("fails closed when the resolved policy repair ceiling is no longer enforced", () => {
    const runner = readFileSync(RUNNER_FILE, "utf8").replace(
      "repairAttempts >= effectiveMaxRepairs",
      "repairAttempts >= dependencies.maxRepairs",
    );
    const result = inspect(runner);

    assert.ok(
      result.missing.some((detail) =>
        detail.includes("repairAttempts >= effectiveMaxRepairs"),
      ),
    );
  });

  it("requires the effective policy-capped budget to reach the LoopRepairer", () => {
    const runner = readFileSync(RUNNER_FILE, "utf8").replace(
      "maxRepairs: effectiveMaxRepairs",
      "maxRepairs: dependencies.maxRepairs",
    );
    const result = inspect(runner);

    assert.ok(
      result.missing.some((detail) =>
        detail.includes("maxRepairs: effectiveMaxRepairs"),
      ),
    );
  });
});
