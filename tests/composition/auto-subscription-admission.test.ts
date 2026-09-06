import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ProjectConfig } from "../../src/core/config.js";
import { evaluateAutoSubscriptionAdmission } from "../../src/composition/auto-subscription-admission.js";

const HEAD = "a".repeat(40);

function project(path: string, executionDecision?: string): ProjectConfig {
  return {
    name: "example",
    path,
    type: "node-cli",
    required_docs: [],
    validation: [],
    planning: { mode: "roadmap" },
    roadmap: ["roadmap.md"],
    ...(executionDecision === undefined
      ? {}
      : { execution_decision: executionDecision }),
  };
}

function writeDecision(
  root: string,
  options: { candidate?: string; brief?: boolean; gitHead?: string } = {},
): string {
  const relative = ".governance/execution-decision.yaml";
  mkdirSync(join(root, ".governance"), { recursive: true });
  writeFileSync(
    join(root, relative),
    [
      "version: 1",
      "project: example",
      "decision:",
      "  state: READY",
      "  candidate:",
      `    id: ${options.candidate ?? "LOT-1"}`,
      "    allowedPaths:",
      "      - src/example.ts",
      ...(options.brief === false
        ? []
        : [
            "  brief:",
            "    objective: Implement the bounded example change.",
            "    deliverables:",
            "      - Update src/example.ts.",
            "    outOfScope:",
            "      - Do not alter deployment.",
          ]),
      "source:",
      `  gitHead: ${options.gitHead ?? HEAD}`,
      "",
    ].join("\n"),
    "utf8",
  );
  return relative;
}

test("AUTO refuses projects without a project-owned execution decision", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-auto-admission-"));
  try {
    assert.deepEqual(
      evaluateAutoSubscriptionAdmission(project(root), HEAD, "LOT-1"),
      {
        ok: false,
        code: "auto_subscription_requires_execution_decision",
        message:
          "Autonomous subscription execution requires a project-owned execution decision.",
      },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AUTO refuses READY decisions without an explicit mission brief", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-auto-admission-"));
  try {
    const decision = writeDecision(root, { brief: false });
    const result = evaluateAutoSubscriptionAdmission(
      project(root, decision),
      HEAD,
      "LOT-1",
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "auto_subscription_requires_brief");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AUTO refuses a candidate that differs from the SHA-bound decision", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-auto-admission-"));
  try {
    const decision = writeDecision(root, { candidate: "LOT-2" });
    const result = evaluateAutoSubscriptionAdmission(
      project(root, decision),
      HEAD,
      "LOT-1",
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "auto_subscription_candidate_mismatch");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("AUTO admits an exact SHA-bound candidate with scope and brief", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-auto-admission-"));
  try {
    const decision = writeDecision(root);
    assert.deepEqual(
      evaluateAutoSubscriptionAdmission(
        project(root, decision),
        HEAD,
        "LOT-1",
      ),
      { ok: true },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
