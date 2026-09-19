import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { ProjectSnapshot } from "../../src/intelligence/snapshot.js";
import { DEFAULT_AGENT_POLICY } from "../../src/policy/defaults.js";
import { runLoopExecute } from "../../src/loop/execute-runner.js";

function project(): ProjectConfig {
  return {
    name: "autonomous-completion",
    path: ".",
    type: "test",
    required_docs: [],
    validation: ["fixture-validation"],
    roadmap: ["roadmap.md"],
  };
}

function candidate(): RoadmapCandidate {
  return {
    id: "VNEXT4-S6A",
    path: "roadmap.md",
    line: 1,
    text: "- [ ] VNEXT4-S6A — Complete governed work",
    kind: "safe",
    reason: "fixture",
    status: "todo",
    priority: "p1",
  };
}

function snapshot(
  fixtureProject: ProjectConfig,
  fixtureCandidate: RoadmapCandidate,
): ProjectSnapshot {
  return {
    project: {
      name: fixtureProject.name,
      type: fixtureProject.type,
      path: fixtureProject.path,
    },
    git: {
      branch: "main",
      clean: true,
      requiresGit: true,
      statusText: "",
      lastCommit: null,
    },
    docs: { required: [], missing: [] },
    validation: {
      commands: fixtureProject.validation,
      configured: true,
    },
    roadmap: {
      available: true,
      paths: fixtureProject.roadmap,
      candidates: [fixtureCandidate],
      selectedCandidate: fixtureCandidate,
      stats: {
        total: 1,
        todo: 1,
        inProgress: 0,
        done: 0,
        unknown: 0,
        safe: 1,
        warning: 0,
        blocked: 0,
      },
      summary: {
        active: 1,
        done: 0,
        selectable: 1,
        hasBlocked: false,
      },
    },
    health: "good",
  };
}

function baseOptions() {
  const fixtureProject = project();
  const fixtureCandidate = candidate();
  let tick = 0;
  return {
    now: () =>
      `2026-09-18T10:00:${String(tick++).padStart(2, "0")}.000Z`,
    generateRunId: () => "run-v57",
    loadConfig: (): Config => ({ projects: [fixtureProject] }),
    buildMinimalContext: () => ({
      project: fixtureProject.name,
      budget: {
        maxFiles: 8,
        maxCharacters: 32_000,
        maxEstimatedTokens: 8_000,
      },
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    }),
    agentPolicy: Object.freeze({
      ...DEFAULT_AGENT_POLICY,
      allowEscalation: false,
    }),
    decomposeOversizedCandidate: true,
  };
}

function openCycle(allowedPaths: readonly string[]) {
  const fixtureProject = project();
  const fixtureCandidate = candidate();
  return {
    outcome: "ready" as const,
    candidate: fixtureCandidate,
    plannedSteps: [],
    snapshot: snapshot(fixtureProject, fixtureCandidate),
    authorizedBy: "execution_decision" as const,
    allowedPaths,
  };
}

describe("V57 autonomous completion repair", () => {
  it("uses one dedicated completion repair and completes only after deterministic reread", async () => {
    let planCalls = 0;
    let executorCalls = 0;
    let validatorCalls = 0;

    const result = await runLoopExecute("autonomous-completion", {
      ...baseOptions(),
      maxRepairs: 1,
      planLoopCycle: () => {
        planCalls += 1;
        if (planCalls === 3) {
          return {
            outcome: "blocked" as const,
            candidate: { ...candidate(), status: "done" as const },
            code: "candidate_done" as const,
            reason: "Roadmap candidate is already done: VNEXT4-S6A",
          };
        }
        return openCycle(["roadmap.md"]);
      },
      readModifiedWorktreeFiles: async () => ["roadmap.md"],
      executor: async (plan) => {
        executorCalls += 1;
        if (executorCalls === 2) {
          assert.equal(plan.worktreeMode, "repair_existing");
          assert.deepEqual(plan.allowedPaths, ["roadmap.md"]);
          assert.equal(
            plan.policy.rationale.some((reason) =>
              reason.includes("Technical validation already passed"),
            ),
            true,
          );
          assert.equal(
            plan.policy.rationale.some((reason) =>
              reason.includes("Do not mark a roadmap item complete merely because validation passed"),
            ),
            true,
          );
        }
        return {
          status: "completed" as const,
          modifiedFiles: ["roadmap.md"],
          details: [`executor call ${executorCalls}`],
        };
      },
      validator: async () => {
        validatorCalls += 1;
        return {
          status: "passed" as const,
          failedCommand: null,
          exitCode: 0,
          details: [`validation ${validatorCalls} passed`],
        };
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(result.failure, null);
    assert.equal(planCalls, 3);
    assert.equal(executorCalls, 2);
    assert.equal(validatorCalls, 2);
    assert.equal(result.validation?.repairAttempts, 0);
    assert.equal(
      result.steps.filter((step) => step.name === "completion_repair").length,
      1,
    );
  });

  it("keeps one completion repair available when the validation repair budget is zero", async () => {
    let planCalls = 0;
    let executorCalls = 0;

    const result = await runLoopExecute("autonomous-completion", {
      ...baseOptions(),
      maxRepairs: 0,
      planLoopCycle: () => {
        planCalls += 1;
        if (planCalls === 3) {
          return {
            outcome: "blocked" as const,
            candidate: { ...candidate(), status: "done" as const },
            code: "candidate_done" as const,
            reason: "Roadmap candidate is already done: VNEXT4-S6A",
          };
        }
        return openCycle(["roadmap.md"]);
      },
      readModifiedWorktreeFiles: async () => ["roadmap.md"],
      executor: async () => {
        executorCalls += 1;
        return {
          status: "completed" as const,
          modifiedFiles: ["roadmap.md"],
          details: [],
        };
      },
      validator: async () => ({
        status: "passed" as const,
        failedCommand: null,
        exitCode: 0,
        details: [],
      }),
    });

    assert.equal(executorCalls, 2);
    assert.equal(result.status, "completed");
    assert.equal(result.failure, null);
    assert.equal(result.validation?.repairAttempts, 0);
    assert.equal(
      result.steps.filter((step) => step.name === "completion_repair").length,
      1,
    );
  });

  it("admits a completion repair when validated worktree files already exist inside the original scope", async () => {
    let planCalls = 0;
    let executorCalls = 0;
    let worktreeReads = 0;

    const result = await runLoopExecute("autonomous-completion", {
      ...baseOptions(),
      maxRepairs: 1,
      planLoopCycle: () => {
        planCalls += 1;
        if (planCalls === 3) {
          return {
            outcome: "blocked" as const,
            candidate: { ...candidate(), status: "done" as const },
            code: "candidate_done" as const,
            reason: "Roadmap candidate is already done: VNEXT4-S6A",
          };
        }
        return openCycle(["roadmap.md", "src/**"]);
      },
      readModifiedWorktreeFiles: async () => {
        worktreeReads += 1;
        return worktreeReads === 1
          ? ["src/feature.ts"]
          : ["roadmap.md", "src/feature.ts"];
      },
      executor: async (plan) => {
        executorCalls += 1;
        if (executorCalls === 2) {
          assert.equal(plan.worktreeMode, "repair_existing");
          assert.deepEqual(plan.allowedPaths, ["roadmap.md", "src/feature.ts"]);
        }
        return {
          status: "completed" as const,
          modifiedFiles:
            executorCalls === 1
              ? ["src/feature.ts"]
              : ["roadmap.md"],
          details: [],
        };
      },
      validator: async () => ({
        status: "passed" as const,
        failedCommand: null,
        exitCode: 0,
        details: [],
      }),
    });

    assert.equal(result.status, "completed");
    assert.equal(result.failure, null);
    assert.equal(executorCalls, 2);
  });

  it("does not repair completion when the canonical roadmap source is outside governed scope", async () => {
    let executorCalls = 0;

    const result = await runLoopExecute("autonomous-completion", {
      ...baseOptions(),
      maxRepairs: 1,
      planLoopCycle: () => openCycle(["src/**"]),
      readModifiedWorktreeFiles: async () => ["src/feature.ts"],
      executor: async () => {
        executorCalls += 1;
        return {
          status: "completed" as const,
          modifiedFiles: ["src/feature.ts"],
          details: [],
        };
      },
      validator: async () => ({
        status: "passed" as const,
        failedCommand: null,
        exitCode: 0,
        details: [],
      }),
    });

    assert.equal(executorCalls, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "candidate_not_completed");
    assert.match(
      result.failure?.details.join("\n") ?? "",
      /canonical roadmap source is outside the governed writable scope/,
    );
  });

  it("keeps completion repair available after the validation repair budget is spent", async () => {
    let planCalls = 0;
    let executorCalls = 0;
    let validatorCalls = 0;

    const result = await runLoopExecute("autonomous-completion", {
      ...baseOptions(),
      maxRepairs: 1,
      planLoopCycle: () => {
        planCalls += 1;
        if (planCalls === 3) {
          return {
            outcome: "blocked" as const,
            candidate: { ...candidate(), status: "done" as const },
            code: "candidate_done" as const,
            reason: "Roadmap candidate is already done: VNEXT4-S6A",
          };
        }
        return openCycle(["roadmap.md"]);
      },
      readModifiedWorktreeFiles: async () => ["roadmap.md"],
      executor: async () => {
        executorCalls += 1;
        return {
          status: "completed" as const,
          modifiedFiles: ["roadmap.md"],
          details: [],
        };
      },
      validator: async () => {
        validatorCalls += 1;
        return validatorCalls === 1
          ? {
              status: "failed" as const,
              failedCommand: "fixture-validation",
              exitCode: 1,
              details: ["validation failed"],
            }
          : {
              status: "passed" as const,
              failedCommand: null,
              exitCode: 0,
              details: ["validation passed"],
            };
      },
    });

    assert.equal(executorCalls, 3);
    assert.equal(validatorCalls, 3);
    assert.equal(result.status, "completed");
    assert.equal(result.failure, null);
    assert.equal(result.validation?.repairAttempts, 1);
    assert.equal(
      result.steps.filter((step) => step.name === "completion_repair").length,
      1,
    );
  });

  it("never performs a second completion repair when the candidate stays open", async () => {
    let executorCalls = 0;
    let validatorCalls = 0;

    const result = await runLoopExecute("autonomous-completion", {
      ...baseOptions(),
      maxRepairs: 2,
      planLoopCycle: () => openCycle(["roadmap.md"]),
      readModifiedWorktreeFiles: async () => ["roadmap.md"],
      executor: async () => {
        executorCalls += 1;
        return {
          status: "completed" as const,
          modifiedFiles: ["roadmap.md"],
          details: [],
        };
      },
      validator: async () => {
        validatorCalls += 1;
        return {
          status: "passed" as const,
          failedCommand: null,
          exitCode: 0,
          details: [],
        };
      },
    });

    assert.equal(executorCalls, 2);
    assert.equal(validatorCalls, 2);
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "candidate_not_completed");
    assert.equal(
      result.steps.filter((step) => step.name === "completion_repair").length,
      1,
    );
    assert.match(
      result.failure?.details.join("\n") ?? "",
      /Completion repair was already attempted once for this run./,
    );
  });

  it("does not spend a completion repair when explicit evidence is still unresolved", async () => {
    let executorCalls = 0;
    let validatorCalls = 0;

    const result = await runLoopExecute("autonomous-completion", {
      ...baseOptions(),
      maxRepairs: 1,
      planLoopCycle: () => openCycle(["roadmap.md"]),
      inspectCompletionEvidenceGate: () => ({
        status: "required" as const,
        kind: "checklist" as const,
        detailPath: "docs/roadmap/detail.md",
        evidencePath: "docs/testing/evidence.md",
        unresolvedCount: 12,
        reason: "unresolved_checklist" as const,
      }),
      readModifiedWorktreeFiles: async () => ["roadmap.md"],
      executor: async () => {
        executorCalls += 1;
        return {
          status: "completed" as const,
          modifiedFiles: ["roadmap.md"],
          details: [],
        };
      },
      validator: async () => {
        validatorCalls += 1;
        return {
          status: "passed" as const,
          failedCommand: null,
          exitCode: 0,
          details: [],
        };
      },
    });

    assert.equal(executorCalls, 1);
    assert.equal(validatorCalls, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "completion_evidence_required");
    assert.equal(result.validation?.repairAttempts, 0);
    assert.equal(
      result.steps.filter((step) => step.name === "completion_repair").length,
      0,
    );
    assert.equal(
      result.steps.filter((step) => step.name === "completion_evidence_required").length,
      1,
    );
    assert.match(
      result.failure?.details.join("\n") ?? "",
      /Unresolved evidence items: 12/,
    );
  });

});
