import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { describe, it } from "node:test";

function runJson(command: string): unknown {
  const output = execSync(command, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return JSON.parse(output) as unknown;
}

describe("json outputs", () => {
  it("summary --json exposes schemaVersion and projects", () => {
    const json = runJson("pnpm exec tsx src/cli.ts summary --json") as {
      schemaVersion?: unknown;
      projects?: unknown;
    };

    assert.equal(json.schemaVersion, 1);
    assert.ok(Array.isArray(json.projects));
  });

  it("context --json exposes schemaVersion and docs", () => {
    const json = runJson(
      "pnpm exec tsx src/cli.ts context loop-engine --json",
    ) as {
      schemaVersion?: unknown;
      docs?: unknown;
    };

    assert.equal(json.schemaVersion, 1);
    assert.ok(json.docs);
  });

  it("next --json exposes schemaVersion and selected candidate field", () => {
    const json = runJson(
      "pnpm exec tsx src/cli.ts next loop-engine --json",
    ) as {
      schemaVersion?: unknown;
      roadmap?: {
        selectedCandidate?: {
          priority?: unknown;
        } | null;
      };
    };

    assert.equal(json.schemaVersion, 1);
    assert.ok(json.roadmap);
    assert.ok("selectedCandidate" in json.roadmap);

    if (json.roadmap.selectedCandidate) {
      assert.equal(typeof json.roadmap.selectedCandidate.priority, "string");
    }
  });

  it("review --json exposes schemaVersion and diffStat", () => {
    const json = runJson(
      "pnpm exec tsx src/cli.ts review loop-engine --json",
    ) as {
      schemaVersion?: unknown;
      diffStat?: unknown;
    };

    assert.equal(json.schemaVersion, 1);
    assert.equal(typeof json.diffStat, "string");
  });

  it("prompt --json exposes schemaVersion and instructions", () => {
    const json = runJson(
      "pnpm exec tsx src/cli.ts prompt loop-engine --json",
    ) as {
      schemaVersion?: unknown;
      instructions?: unknown;
    };

    assert.equal(json.schemaVersion, 1);
    assert.ok(Array.isArray(json.instructions));
  });

  it("run --mode plan --json exposes a LoopRunResult and touches nothing", () => {
    const json = runJson(
      "pnpm exec tsx src/cli.ts run loop-engine --mode plan --json",
    ) as {
      schemaVersion?: unknown;
      mode?: unknown;
      status?: unknown;
      modifiedFiles?: unknown;
      commit?: unknown;
      publication?: unknown;
      agentPolicy?: {
        mode?: unknown;
        status?: unknown;
        requirements?: {
          executionBudget?: { maxCalls?: unknown };
          contextBudget?: unknown;
        };
      } | null;
      contextPackage?: {
        project?: unknown;
        budget?: unknown;
        files?: unknown;
        omitted?: unknown;
        totalCharacters?: unknown;
        estimatedTokens?: unknown;
        truncated?: unknown;
      } | null;
    };

    assert.equal(json.schemaVersion, 1);
    assert.equal(json.mode, "plan");
    assert.ok(typeof json.status === "string");
    assert.deepEqual(json.modifiedFiles, []);
    assert.equal(json.commit, null);
    assert.equal(json.publication, null);
    assert.ok("agentPolicy" in json);
    assert.ok("contextPackage" in json);
    // contextPackage is null exactly when agentPolicy is null (blocked/failed
    // cycles); both are populated together for a completed cycle.
    assert.equal(json.agentPolicy === null, json.contextPackage === null);

    if (json.agentPolicy) {
      assert.equal(json.agentPolicy.mode, "plan");
      assert.ok(typeof json.agentPolicy.status === "string");
      // The forecast never implies a real call: this run's own budget stays 0.
      assert.equal(json.agentPolicy.requirements?.executionBudget?.maxCalls, 0);
    }

    if (json.contextPackage) {
      assert.equal(typeof json.contextPackage.project, "string");
      assert.ok(Array.isArray(json.contextPackage.files));
      assert.ok(Array.isArray(json.contextPackage.omitted));
      assert.ok(typeof json.contextPackage.totalCharacters === "number");
      assert.ok(typeof json.contextPackage.estimatedTokens === "number");
      assert.ok(typeof json.contextPackage.truncated === "boolean");
      assert.deepEqual(
        json.contextPackage.budget,
        json.agentPolicy?.requirements?.contextBudget,
      );
    }
  });

  it("run defaults to mode plan when --mode is omitted", () => {
    const json = runJson("pnpm exec tsx src/cli.ts run loop-engine --json") as {
      mode?: unknown;
    };

    assert.equal(json.mode, "plan");
  });
});
