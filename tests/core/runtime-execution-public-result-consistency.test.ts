import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  finalizeRuntimeExecutionPublicResult,
  projectRuntimeExecutionReceiptReportingResult,
  serializeRuntimeExecutionReceiptReportingPublicResult,
  type PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult,
} from "../../src/core/index.js";

function failureFixture(): PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult {
  return Object.freeze({
    outcome: "resolution_failed",
    resolution: Object.freeze({ internal: true }),
    runtimeResult: null,
    receipt: null,
    report: null,
    diagnostics: Object.freeze([
      Object.freeze({
        code: "runtime_execution_runtime_not_allowed",
        message: "internal",
        details: Object.freeze({ private: true }),
      }),
    ]),
  }) as unknown as PolicyAwareDeclarativeRuntimeExecutionWithReceiptReportResult;
}

test("public result serializer serializes the exact projection supplied to it", () => {
  const projection = projectRuntimeExecutionReceiptReportingResult(failureFixture());

  assert.equal(
    serializeRuntimeExecutionReceiptReportingPublicResult(projection),
    JSON.stringify(projection),
  );
});

test("public result facade returns JSON for the same public result it exposes", () => {
  const facade = finalizeRuntimeExecutionPublicResult(failureFixture());

  assert.equal(facade.serialized, JSON.stringify(facade.result));
  assert.deepEqual(JSON.parse(facade.serialized), facade.result);
});

test("facade no longer serializes by re-projecting the integrated result", () => {
  const source = readFileSync(
    "src/core/runtime-execution-public-result-facade.ts",
    "utf8",
  );

  assert.match(
    source,
    /serializeRuntimeExecutionReceiptReportingPublicResult\(result\)/,
  );
  assert.doesNotMatch(
    source,
    /serializeRuntimeExecutionReceiptReportingResult\(integrated\)/,
  );
});
