import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { DefaultLoopCliPlanClient } from "../main/cli-plan-client.js";
import { NodeProcessRunner } from "../main/node-process-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoPath = resolve(__dirname, "..", "..");

function gitStatus(): string {
  return execFileSync("git", ["status", "--short"], { cwd: repoPath }).toString();
}

describe("CLI plan integration", () => {
  it("executes the real Loop Engine run --mode plan JSON command and touches nothing", async () => {
    const client = new DefaultLoopCliPlanClient(new NodeProcessRunner());

    const before = gitStatus();
    const report = await client.loadProjectPlan(repoPath, "loop-engine");
    const after = gitStatus();

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.project, "loop-engine");
    assert.equal(report.mode, "plan");
    assert.ok(Array.isArray(report.modifiedFiles));
    assert.equal(after, before, "run --mode plan must not modify the worktree");
  });
});
