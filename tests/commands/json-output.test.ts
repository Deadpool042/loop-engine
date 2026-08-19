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

  it("status --json exposes schemaVersion and projects", () => {
    const json = runJson("pnpm exec tsx src/cli.ts status --json") as {
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

  it("roadmap objective --json exposes the V1 canonical objective contract", () => {
    const json = runJson(
      "pnpm exec tsx src/cli.ts roadmap objective loop-engine --json",
    ) as {
      schemaVersion?: unknown;
      project?: { name?: unknown };
      planning?: { mode?: unknown };
      objective?: {
        source?: unknown;
        available?: unknown;
        eligibleForRoadmapProposal?: unknown;
        content?: unknown;
      };
    };

    assert.equal(json.schemaVersion, 1);
    assert.equal(json.project?.name, "loop-engine");
    assert.equal(json.planning?.mode, "roadmap");
    assert.equal(
      json.objective?.source,
      "docs/architecture/final-objective.md",
    );
    assert.equal(json.objective?.available, true);
    assert.equal(json.objective?.eligibleForRoadmapProposal, true);
    assert.equal(typeof json.objective?.content, "string");
  });

  it("roadmap objective --json reports maintenance as deliberately ineligible", () => {
    const json = runJson(
      "pnpm exec tsx src/cli.ts roadmap objective n8n --json",
    ) as {
      schemaVersion?: unknown;
      planning?: { mode?: unknown };
      objective?: {
        available?: unknown;
        eligibleForRoadmapProposal?: unknown;
        reason?: unknown;
      };
    };

    assert.equal(json.schemaVersion, 1);
    assert.equal(json.planning?.mode, "maintenance");
    assert.equal(json.objective?.available, false);
    assert.equal(json.objective?.eligibleForRoadmapProposal, false);
    assert.equal(json.objective?.reason, "planning_mode_maintenance");
  });

  it("roadmap proposal-context --json exposes bounded V1 canonical planning data", () => {
    const json = runJson(
      "pnpm exec tsx src/cli.ts roadmap proposal-context loop-engine --json",
    ) as {
      schemaVersion?: unknown;
      project?: { name?: unknown; type?: unknown };
      planning?: { mode?: unknown };
      objective?: {
        source?: unknown;
        content?: unknown;
        eligibleForRoadmapProposal?: unknown;
      };
      context?: unknown;
      roadmap?: {
        configuredPaths?: unknown;
        stats?: { todo?: unknown };
        candidates?: { items?: unknown; total?: unknown; truncated?: unknown };
        phaseGates?: { items?: unknown; total?: unknown; truncated?: unknown };
      };
      projectState?: { git?: unknown; validation?: unknown; health?: unknown };
    };

    assert.equal(json.schemaVersion, 1);
    assert.equal(json.project?.name, "loop-engine");
    assert.equal(json.planning?.mode, "roadmap");
    assert.equal(json.objective?.source, "docs/architecture/final-objective.md");
    assert.equal(typeof json.objective?.content, "string");
    assert.equal(json.objective?.eligibleForRoadmapProposal, true);
    assert.equal(json.context, "available");
    assert.ok(Array.isArray(json.roadmap?.configuredPaths));
    assert.equal(typeof json.roadmap?.stats?.todo, "number");
    assert.ok(Array.isArray(json.roadmap?.candidates?.items));
    assert.equal(typeof json.roadmap?.candidates?.total, "number");
    assert.equal(typeof json.roadmap?.candidates?.truncated, "boolean");
    assert.ok(Array.isArray(json.roadmap?.phaseGates?.items));
    assert.equal(typeof json.roadmap?.phaseGates?.total, "number");
    assert.equal(typeof json.roadmap?.phaseGates?.truncated, "boolean");
    assert.ok(json.projectState?.git);
    assert.ok(json.projectState?.validation);
    assert.ok(json.projectState?.health);
  });

  it("roadmap proposal-context --json refuses maintenance deliberately", () => {
    const json = runJson(
      "pnpm exec tsx src/cli.ts roadmap proposal-context n8n --json",
    ) as {
      schemaVersion?: unknown;
      planning?: { mode?: unknown };
      objective?: {
        available?: unknown;
        eligibleForRoadmapProposal?: unknown;
        reason?: unknown;
      };
      context?: unknown;
      roadmap?: unknown;
    };

    assert.equal(json.schemaVersion, 1);
    assert.equal(json.planning?.mode, "maintenance");
    assert.equal(json.objective?.available, false);
    assert.equal(json.objective?.eligibleForRoadmapProposal, false);
    assert.equal(json.objective?.reason, "planning_mode_maintenance");
    assert.equal(json.context, null);
    assert.equal("roadmap" in json, false);
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
        phaseGates?: unknown;
      };
    };

    assert.equal(json.schemaVersion, 1);
    assert.ok(json.roadmap);
    assert.ok("selectedCandidate" in json.roadmap);
    assert.ok(Array.isArray(json.roadmap.phaseGates));

    if (json.roadmap.selectedCandidate) {
      assert.equal(typeof json.roadmap.selectedCandidate.priority, "string");
    }
  });

  it("review --json exposes schemaVersion, diffStat, and documentation impact", () => {
    const json = runJson(
      "pnpm exec tsx src/cli.ts review loop-engine --json",
    ) as {
      schemaVersion?: unknown;
      diffStat?: unknown;
      documentationImpact?: {
        changedPaths?: unknown;
        impacts?: unknown;
        semanticReviewRequired?: unknown;
      };
    };

    assert.equal(json.schemaVersion, 1);
    assert.equal(typeof json.diffStat, "string");
    assert.ok(json.documentationImpact);
    assert.ok(Array.isArray(json.documentationImpact.changedPaths));
    assert.ok(Array.isArray(json.documentationImpact.impacts));
    assert.equal(
      typeof json.documentationImpact.semanticReviewRequired,
      "boolean",
    );
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
