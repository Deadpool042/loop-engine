import assert from "node:assert/strict";
import { test } from "node:test";
import { getExecutionDecisionCurrentReport } from "../../src/composition/execution-decision-current.js";

test("execution-decision current returns only the bounded LP-INFRA bindings", () => { const report = getExecutionDecisionCurrentReport("lp-infra", () => ({ project: "lp-infra", projectPath: "/tmp/lp-infra", candidateId: "H4-L1", gitHead: "a".repeat(40), sourceDocument: "docs/roadmap/projet-lp-infra.md", executionDecisionPath: ".governance/execution-decision.yaml", projectConfig: { name: "lp-infra", path: "/tmp/lp-infra", type: "infra", required_docs: [], validation: [], roadmap: ["docs/roadmap/projet-lp-infra.md"], execution_decision: ".governance/execution-decision.yaml" } })); assert.equal(report.schemaVersion, 1); assert.equal(report.project, "lp-infra"); assert.equal(report.current?.candidateId, "H4-L1"); assert.equal(Object.keys(report.current ?? {}).includes("projectConfig"), false); });
test("execution-decision current returns null for an unknown project", () => { assert.deepEqual(getExecutionDecisionCurrentReport("unknown"), { schemaVersion: 1, project: "unknown", current: null }); });
