import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseExecutionDecisionFile } from "../../src/governance/execution-decision.js";

const SHA = "a".repeat(40);

function validYaml(overrides: Record<string, string> = {}): string {
  const base = [
    "version: 1",
    "project: fixture",
    "decision:",
    "  state: READY",
    "  candidate:",
    "    id: C7-L1",
    "    allowedPaths:",
    "      - docs/platform/**",
    "source:",
    `  gitHead: ${SHA}`,
  ];
  return Object.assign(base, overrides).join("\n");
}

describe("parseExecutionDecisionFile", () => {
  it("accepts a well-formed READY decision", () => {
    const result = parseExecutionDecisionFile(validYaml());
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.decision.decision.state, "READY");
      assert.equal(result.decision.decision.candidate?.id, "C7-L1");
      assert.deepEqual(result.decision.decision.candidate?.allowedPaths, ["docs/platform/**"]);
      assert.equal(result.decision.source.gitHead, SHA);
    }
  });

  it("accepts a well-formed non-READY decision without a candidate", () => {
    const yaml = [
      "version: 1",
      "project: fixture",
      "decision:",
      "  state: REVALIDATION_REQUIRED",
      "  reason: preproduction_qualification_required",
      "source:",
      `  gitHead: ${SHA}`,
    ].join("\n");

    const result = parseExecutionDecisionFile(yaml);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.decision.decision.state, "REVALIDATION_REQUIRED");
      assert.equal(result.decision.decision.candidate, undefined);
    }
  });

  it("rejects invalid YAML", () => {
    const result = parseExecutionDecisionFile("::: not yaml :::");
    assert.equal(result.ok, false);
  });

  it("rejects a missing or wrong version", () => {
    const yaml = [
      "version: 2",
      "project: fixture",
      "decision:",
      "  state: READY",
      "  candidate:",
      "    id: C7-L1",
      "source:",
      `  gitHead: ${SHA}`,
    ].join("\n");

    const result = parseExecutionDecisionFile(yaml);
    assert.equal(result.ok, false);
  });

  it("rejects an unknown state", () => {
    const yaml = [
      "version: 1",
      "project: fixture",
      "decision:",
      "  state: NOT_A_REAL_STATE",
      "source:",
      `  gitHead: ${SHA}`,
    ].join("\n");

    const result = parseExecutionDecisionFile(yaml);
    assert.equal(result.ok, false);
  });

  it("rejects READY without decision.candidate.id", () => {
    const yaml = [
      "version: 1",
      "project: fixture",
      "decision:",
      "  state: READY",
      "source:",
      `  gitHead: ${SHA}`,
    ].join("\n");

    const result = parseExecutionDecisionFile(yaml);
    assert.equal(result.ok, false);
  });

  it("classifies a missing READY writable file scope separately", () => {
    const result = parseExecutionDecisionFile([
      "version: 1",
      "project: fixture",
      "decision:",
      "  state: READY",
      "  candidate:",
      "    id: C7-L1",
      "source:",
      `  gitHead: ${SHA}`,
    ].join("\n"));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "scope_missing");
  });

  it("rejects a gitHead that is not a full 40-character SHA", () => {
    const yaml = [
      "version: 1",
      "project: fixture",
      "decision:",
      "  state: READY",
      "  candidate:",
      "    id: C7-L1",
      "source:",
      "  gitHead: abc123",
    ].join("\n");

    const result = parseExecutionDecisionFile(yaml);
    assert.equal(result.ok, false);
  });

  it("rejects a missing project field", () => {
    const yaml = [
      "version: 1",
      "decision:",
      "  state: BLOCKED",
      "source:",
      `  gitHead: ${SHA}`,
    ].join("\n");

    const result = parseExecutionDecisionFile(yaml);
    assert.equal(result.ok, false);
  });
});
