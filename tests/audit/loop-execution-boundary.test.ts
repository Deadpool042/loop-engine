import assert from "node:assert/strict";
import { test } from "node:test";

import {
  inspectLoopExecutionBoundaryInvariant,
  LOOP_EXECUTION_BOUNDARY_INVARIANTS,
  LOOP_EXECUTION_BOUNDARY_RULE,
} from "../../src/audit/rules/audit.js";

test("V13.28 Loop execution boundary audit rule is contiguous and pass", () => {
  assert.deepEqual([LOOP_EXECUTION_BOUNDARY_RULE.id], ["AUDIT-420"]);
  assert.equal(LOOP_EXECUTION_BOUNDARY_RULE.check().status, "pass");
});

test("AUDIT-420 rejects runtime and Core local-process imports inside src/loop sources", () => {
  const source = `
    import { runLoopPlan } from "../loop/runner.js";
    import { dryRunPolicyBoundLocalProcessExecution, executePolicyBoundLocalProcessWithReceipt } from "../core/runtime-execution-bridge.js";
    import { prepareLoopPolicyBoundLocalProcessExecution } from "../core/loop.js";
    import { executeLoopPolicyBoundLocalProcessWithReceipt } from "../core/loop.js";
    import { LOCAL_PROCESS_RUNTIME_ID } from '../runtime/types.js';
    import { LOCAL_PROCESS_RUNTIME_ID } from "../runtime/types.js";
  `;

  assert.deepEqual(
    inspectLoopExecutionBoundaryInvariant(source).sort(),
    [...LOOP_EXECUTION_BOUNDARY_INVARIANTS.forbiddenTokens].sort(),
  );
});
