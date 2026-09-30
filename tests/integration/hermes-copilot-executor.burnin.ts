import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createHermesCopilotCliLoopExecutor } from "../../src/loop/hermes-copilot-cli-executor.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";

test("V59 real Hermes Copilot file-only burn-in", { timeout: 240_000 }, async () => {
  const executable = "/home/ubuntu/.local/bin/hermes";
  assert.equal(existsSync(executable), true, "Hermes CLI must exist on vps-main");

  const cwd = mkdtempSync(join(tmpdir(), "loop-v59-copilot-burnin-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd });
    execFileSync("git", ["config", "user.email", "burnin@example.invalid"], { cwd });
    execFileSync("git", ["config", "user.name", "V59 Burnin"], { cwd });

    const plan: LoopExecutionPlan = Object.freeze({
      schemaVersion: 1,
      runId: "v59-real-copilot",
      project: { name: "v59-burnin" },
      candidate: {
        path: "roadmap.md",
        line: 1,
        text: "- [ ] Create proof.txt containing exactly V59_COPILOT_OK followed by a newline. Do not create or modify any other file.",
        kind: "safe",
        reason: "V59 bounded burn-in",
        status: "todo",
        priority: "default",
      },
      contextPackage: {
        project: "v59-burnin",
        budget: {
          maxFiles: 1,
          maxCharacters: 2_000,
          maxEstimatedTokens: 500,
          includeFullFiles: false,
        },
        files: [],
        omitted: [],
        totalCharacters: 0,
        estimatedTokens: 0,
        truncated: false,
      },
      provider: "github",
      runtime: "copilot",
      profileId: "configured.copilot.luna",
      model: "gpt-6-luna",
      effort: "low",
      delegation: {
        mode: "direct_preferred",
        reason: "low_effort",
      },
      budget: {
        maxTokens: null,
        maxCostUsd: null,
        maxDurationMs: 180_000,
        maxCalls: 1,
        maxRepairs: 0,
      },
      allowedPaths: ["proof.txt"],
      brief: {
        objective: "Prove the governed file-only Copilot executor on vps-main.",
        deliverables: ["proof.txt containing exactly V59_COPILOT_OK followed by a newline."],
        outOfScope: [
          "Any other file",
          "Shell execution",
          "Network or browser use",
          "Git commit, push or publication",
        ],
      },
      policy: {
        id: "auto-subscription",
        mode: "execute",
        status: "resolved",
        requiredCapabilities: ["code_edit"],
        requiredPermissions: ["read_only", "write_worktree"],
        allowedFundingModes: ["included_subscription"],
        rationale: ["V59 real burn-in"],
      },
    });

    const result = await createHermesCopilotCliLoopExecutor({
      executable,
      model: "gpt-6-luna",
      timeoutMs: 180_000,
      maxTurns: 6,
    })(plan, cwd);

    assert.equal(result.status, "completed", JSON.stringify(result));
    assert.deepEqual(result.modifiedFiles, ["proof.txt"]);
    assert.equal(readFileSync(join(cwd, "proof.txt"), "utf8"), "V59_COPILOT_OK\n");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
