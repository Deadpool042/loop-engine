import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { ProjectConfig } from "../../src/core/config.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import { validateLoopExecution } from "../../src/loop/execution.js";

function project(path: string, command: string): ProjectConfig {
  return {
    name: "validation-diagnostics",
    path,
    type: "test",
    required_docs: [],
    validation: [command],
    roadmap: [],
  };
}

const candidate: RoadmapCandidate = {
  path: "roadmap.md",
  line: 1,
  text: "- [ ] validation diagnostics",
  kind: "safe",
  reason: "fixture",
  status: "todo",
  priority: "default",
};

describe("validateLoopExecution repair diagnostics", () => {
  it("captures bounded compiler diagnostics for repair without exposing them in public details", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-validation-diagnostics-"));
    try {
      const command =
        "node -e \"console.error('src/example.ts(4,2): error TS2322: Type string is not assignable to number'); process.exit(2)\"";
      const result = await validateLoopExecution({
        runId: "run-validation-diagnostics",
        project: project(root, command),
        candidate,
        modifiedFiles: [],
        attempt: 1,
      });

      assert.equal(result.status, "failed");
      assert.equal(result.failedCommand, command);
      assert.equal(result.exitCode, 2);
      assert.deepEqual(result.details, [
        "Validation attempt 1 failed.",
        `Failed command: ${command}`,
      ]);
      assert.equal(
        result.repairDiagnostics?.some((line) =>
          line.includes("error TS2322"),
        ),
        true,
      );
      assert.equal(JSON.stringify(result.details).includes("TS2322"), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("redacts credential-like values from repair diagnostics", async () => {
    const root = mkdtempSync(join(tmpdir(), "loop-validation-redaction-"));
    try {
      const command =
        "node -e \"console.error('DATABASE_URL=postgresql://user:supersecret@db.invalid/app'); console.error('API_SECRET=topsecret'); process.exit(1)\"";
      const result = await validateLoopExecution({
        runId: "run-validation-redaction",
        project: project(root, command),
        candidate,
        modifiedFiles: [],
        attempt: 1,
      });

      const diagnostics = JSON.stringify(result.repairDiagnostics ?? []);
      assert.equal(diagnostics.includes("supersecret"), false);
      assert.equal(diagnostics.includes("topsecret"), false);
      assert.equal(diagnostics.includes("[REDACTED]"), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
