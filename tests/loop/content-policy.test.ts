import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { inspectWorktreeContentPolicy } from "../../src/loop/content-policy.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";

function setupRepository(): {
  cwd: string;
  cleanup: () => void;
} {
  const cwd = mkdtempSync(join(tmpdir(), "loop-content-policy-"));
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  writeFileSync(
    join(cwd, "existing.md"),
    "Docker is mentioned in the existing documentation.\n",
  );
  execFileSync("git", ["add", "existing.md"], { cwd });
  execFileSync("git", ["commit", "-qm", "baseline"], { cwd });
  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function plan(): LoopExecutionPlan {
  return {
    schemaVersion: 1,
    runId: "run-content-policy",
    project: { name: "test" },
    candidate: {
      path: "roadmap.md",
      line: 1,
      text: "- [ ] test",
      kind: "safe",
      reason: "test",
      status: "todo",
      priority: "default",
    },
    contextPackage: {
      project: "test",
      budget: {
        maxFiles: 1,
        maxCharacters: 1000,
        maxEstimatedTokens: 1000,
        includeFullFiles: false,
      },
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    },
    brief: {
      objective: "Test governed content.",
      deliverables: ["Update documentation."],
      outOfScope: ["Other changes."],
      forbiddenContentTerms: ["docker"],
    },
    provider: "anthropic",
    runtime: "claude_code",
    profileId: "test",
    model: "claude-haiku-4-5",
    effort: "low",
    delegation: {
      mode: "direct_preferred",
      reason: "low_effort",
    },
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: null,
      maxRepairs: null,
    },
    policy: {
      id: "test",
      mode: "execute",
      status: "resolved",
      requiredCapabilities: [],
      requiredPermissions: [],
      rationale: [],
    },
  };
}

describe("inspectWorktreeContentPolicy", () => {
  it("allows a pre-existing forbidden literal when its occurrence count does not increase", async () => {
    const { cwd, cleanup } = setupRepository();
    try {
      writeFileSync(
        join(cwd, "existing.md"),
        "Docker is mentioned in the existing documentation.\nAdditional neutral guidance.\n",
      );

      assert.deepEqual(
        await inspectWorktreeContentPolicy(plan(), cwd, ["existing.md"]),
        { outcome: "compliant" },
      );
    } finally {
      cleanup();
    }
  });

  it("rejects an additional occurrence of a forbidden literal in an existing file", async () => {
    const { cwd, cleanup } = setupRepository();
    try {
      writeFileSync(
        join(cwd, "existing.md"),
        "Docker is mentioned in the existing documentation.\nA second docker reference was generated.\n",
      );

      assert.deepEqual(
        await inspectWorktreeContentPolicy(plan(), cwd, ["existing.md"]),
        { outcome: "violation" },
      );
    } finally {
      cleanup();
    }
  });

  it("rejects a forbidden literal in a newly generated file", async () => {
    const { cwd, cleanup } = setupRepository();
    try {
      writeFileSync(join(cwd, "generated.md"), "Generated Docker guidance.\n");

      assert.deepEqual(
        await inspectWorktreeContentPolicy(plan(), cwd, ["generated.md"]),
        { outcome: "violation" },
      );
    } finally {
      cleanup();
    }
  });

  it("accepts compliant content in a newly generated file", async () => {
    const { cwd, cleanup } = setupRepository();
    try {
      writeFileSync(join(cwd, "generated.md"), "Generated documentation guidance.\n");

      assert.deepEqual(
        await inspectWorktreeContentPolicy(plan(), cwd, ["generated.md"]),
        { outcome: "compliant" },
      );
    } finally {
      cleanup();
    }
  });
});
