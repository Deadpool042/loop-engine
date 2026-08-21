import assert from "node:assert/strict";
import { test } from "node:test";
import { getExecutionDecisionCurrentReport } from "../../src/composition/execution-decision-current.js";

test("execution-decision current returns only the bounded LP-INFRA bindings", () => { const report = getExecutionDecisionCurrentReport("lp-infra"); assert.equal(report.schemaVersion, 1); assert.equal(report.project, "lp-infra"); assert.equal(report.current?.candidateId, "H4-L1"); assert.equal(Object.keys(report.current ?? {}).includes("projectConfig"), false); });
test("execution-decision current returns null for an unknown project", () => { assert.deepEqual(getExecutionDecisionCurrentReport("unknown"), { schemaVersion: 1, project: "unknown", current: null }); });
