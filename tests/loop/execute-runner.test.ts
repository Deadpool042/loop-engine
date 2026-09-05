import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import type { AgentProfile } from "../../src/agents/types.js";
import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { ProjectSnapshot } from "../../src/intelligence/snapshot.js";
import { runLoopExecute } from "../../src/loop/execute-runner.js";
import { DEFAULT_AGENT_POLICY } from "../../src/policy/defaults.js";
import { readModifiedWorktreeFiles } from "../../src/loop/worktree-status.js";

function fixtureProject(): ProjectConfig {
  return {
    name: "fixture-project",
    path: ".",
    type: "test",
    required_docs: [],
    validation: ["pnpm run typecheck", "pnpm run audit:strict"],
    roadmap: ["roadmap.md"],
  };
}

function fixtureCandidate(): RoadmapCandidate {
  return {
    path: "roadmap.md",
    line: 3,
    text: "- [ ] Implement a small code change with tests",
    kind: "safe",
    reason: "no sensitive keyword detected",
    status: "todo",
    priority: "default",
  };
}

function fixtureSnapshot(
  project: ProjectConfig,
  candidate: RoadmapCandidate,
): ProjectSnapshot {
  return {
    project: { name: project.name, type: project.type, path: project.path },
    git: {
      branch: "main",
      clean: true,
      requiresGit: true,
      statusText: "",
      lastCommit: null,
    },
    docs: { required: [], missing: [] },
    validation: { commands: project.validation, configured: true },
    roadmap: {
      available: true,
      paths: project.roadmap,
      candidates: [candidate],
      selectedCandidate: candidate,
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
      summary: { active: 1, done: 0, selectable: 1, hasBlocked: false },
    },
    health: "good",
  };
}

function fixtureConfig(project: ProjectConfig): Config {
  return { projects: [project] };
}

function deterministicOptions() {
  const project = fixtureProject();
  const candidate = fixtureCandidate();
  const snapshot = fixtureSnapshot(project, candidate);
  let tick = 0;

  return {
    now: () => `2026-01-01T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    generateRunId: () => "run-execute-fixed",
    loadConfig: () => fixtureConfig(project),
    planLoopCycle: () => ({
      outcome: "ready" as const,
      candidate,
      plannedSteps: ["Execute candidate", "Validate changes"],
      snapshot,
    }),
    buildMinimalContext: (_snapshot: ProjectSnapshot, budget: any) => ({
      project: project.name,
      budget,
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    }),
    readModifiedWorktreeFiles: async () => [],
  };
}

function escalationProfile(
  overrides: Partial<AgentProfile> = {},
): AgentProfile {
  return {
    id: "economy",
    runtime: "codex",
    provider: "openai",
    model: "economy-model",
    effort: "low",
    economicTier: "economy",
    capabilities: ["code_edit", "test_execution"],
    permissions: ["read_only", "write_worktree", "shell_exec"],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: 1,
      maxRepairs: 1,
    },
    ...overrides,
  };
}

async function createGitWorktree(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "loop-execute-runner-"));
  execFileSync("git", ["init", "-q"], { cwd });
  return cwd;
}

describe("runLoopExecute", () => {
  it("enforces governed content policy before validation even if an injected executor bypasses its own guard", async () => {
    const cwd = await createGitWorktree();
    const project = { ...fixtureProject(), path: cwd };
    const candidate = fixtureCandidate();
    let validatorCalls = 0;

    try {
      const result = await runLoopExecute(project.name, {
        ...deterministicOptions(),
        loadConfig: () => fixtureConfig(project),
        planLoopCycle: () => ({
          outcome: "ready" as const,
          candidate,
          plannedSteps: [],
          snapshot: fixtureSnapshot(project, candidate),
          brief: {
            objective: "Write a documentation standard.",
            deliverables: ["generated.md"],
            outOfScope: ["Infrastructure configuration"],
            forbiddenContentTerms: ["docker"],
          },
        }),
        readModifiedWorktreeFiles,
        executor: async () => {
          await writeFile(join(cwd, "generated.md"), "Docker configuration\n");
          return {
            status: "completed" as const,
            modifiedFiles: [],
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

      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "content_policy_violation");
      assert.equal(result.validation, null);
      assert.equal(validatorCalls, 0);
      assert.equal(JSON.stringify(result).includes("docker"), false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("carries only the project's logical name in the plan, unaffected by its physical checkout path", async () => {
    const firstCwd = await createGitWorktree();
    const secondCwd = await createGitWorktree();
    const candidate = fixtureCandidate();
    const observedPlanProjects: unknown[] = [];
    const observedCwds: string[] = [];

    const runWithPath = async (path: string) => {
      const project = { ...fixtureProject(), path };
      return runLoopExecute(project.name, {
        ...deterministicOptions(),
        loadConfig: () => fixtureConfig(project),
        planLoopCycle: () => ({
          outcome: "ready" as const,
          candidate,
          plannedSteps: [],
          snapshot: fixtureSnapshot(project, candidate),
        }),
        readModifiedWorktreeFiles: async () => [],
        executor: async (plan, cwd) => {
          observedPlanProjects.push(plan.project);
          observedCwds.push(cwd);
          return {
            status: "completed" as const,
            modifiedFiles: [],
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
    };

    try {
      const first = await runWithPath(firstCwd);
      const second = await runWithPath(secondCwd);

      assert.equal(first.status, "completed");
      assert.equal(second.status, "completed");
      assert.deepEqual(observedPlanProjects, [
        { name: "fixture-project" },
        { name: "fixture-project" },
      ]);
      assert.notEqual(observedCwds[0], observedCwds[1]);
      assert.deepEqual(observedCwds, [firstCwd, secondCwd]);
    } finally {
      await rm(firstCwd, { recursive: true, force: true });
      await rm(secondCwd, { recursive: true, force: true });
    }
  });

  it("enforces governed scope from the real worktree when an injected executor omits its modified file", async () => {
    const cwd = await createGitWorktree();
    const project = { ...fixtureProject(), path: cwd };
    const candidate = fixtureCandidate();
    let validatorCalls = 0;

    try {
      const result = await runLoopExecute(project.name, {
        ...deterministicOptions(),
        loadConfig: () => fixtureConfig(project),
        planLoopCycle: () => ({
          outcome: "ready" as const,
          candidate,
          plannedSteps: [],
          snapshot: fixtureSnapshot(project, candidate),
          allowedPaths: ["docs/**"],
        }),
        readModifiedWorktreeFiles,
        executor: async () => {
          await writeFile(join(cwd, "outside.md"), "outside scope\n");
          return {
            status: "completed" as const,
            modifiedFiles: [],
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

      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "scope_violation");
      assert.deepEqual(result.modifiedFiles, ["outside.md"]);
      assert.equal(validatorCalls, 0);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("rechecks real worktree content after repair instead of trusting repairResult.modifiedFiles", async () => {
    const cwd = await createGitWorktree();
    const project = { ...fixtureProject(), path: cwd };
    const candidate = fixtureCandidate();
    let validatorCalls = 0;

    try {
      const result = await runLoopExecute(project.name, {
        ...deterministicOptions(),
        loadConfig: () => fixtureConfig(project),
        maxRepairs: 1,
        planLoopCycle: () => ({
          outcome: "ready" as const,
          candidate,
          plannedSteps: [],
          snapshot: fixtureSnapshot(project, candidate),
          brief: {
            objective: "Write a documentation standard.",
            deliverables: ["generated.md"],
            outOfScope: ["Infrastructure configuration"],
            forbiddenContentTerms: ["docker"],
          },
        }),
        readModifiedWorktreeFiles,
        executor: async () => {
          await writeFile(
            join(cwd, "generated.md"),
            "Documentation standard\n",
          );
          return {
            status: "completed" as const,
            modifiedFiles: [],
            details: [],
          };
        },
        validator: async () => {
          validatorCalls += 1;
          return {
            status: "failed" as const,
            failedCommand: "expected",
            exitCode: 1,
            details: [],
          };
        },
        repairer: async () => {
          await writeFile(join(cwd, "repair.md"), "Docker configuration\n");
          return {
            status: "completed" as const,
            modifiedFiles: [],
            details: [],
          };
        },
      });

      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "content_policy_violation");
      assert.equal(validatorCalls, 1);
      assert.deepEqual(result.modifiedFiles, ["generated.md", "repair.md"]);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  it("blocks a governed scope violation before validation or repair", async () => {
    let executorCalls = 0;
    let validatorCalls = 0;
    let repairCalls = 0;
    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      planLoopCycle: () => ({
        outcome: "ready" as const,
        candidate: fixtureCandidate(),
        plannedSteps: [],
        snapshot: fixtureSnapshot(fixtureProject(), fixtureCandidate()),
        authorizedBy: "execution_decision" as const,
        allowedPaths: ["docs/platform/**"],
      }),
      maxRepairs: 1,
      readModifiedWorktreeFiles: async () => [
        "docs/platform/README.md",
        "docs/roadmap/projet-lp-infra.md",
      ],
      executor: async () => {
        executorCalls += 1;
        return {
          status: "completed",
          modifiedFiles: [
            "docs/platform/README.md",
            "docs/roadmap/projet-lp-infra.md",
          ],
          details: [],
        };
      },
      validator: async () => {
        validatorCalls += 1;
        return {
          status: "passed",
          failedCommand: null,
          exitCode: 0,
          details: [],
        };
      },
      repairer: async () => {
        repairCalls += 1;
        return { status: "completed", modifiedFiles: [], details: [] };
      },
    });

    assert.equal(executorCalls, 1);
    assert.equal(validatorCalls, 0);
    assert.equal(repairCalls, 0);
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "scope_violation");
    assert.match(
      result.failure?.details.join("\n") ?? "",
      /docs\/roadmap\/projet-lp-infra\.md/,
    );
    assert.equal(result.validation, null);
    assert.equal(result.patchExport, undefined);
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
  });

  it("rechecks governed scope after repair before a second validation", async () => {
    let validatorCalls = 0;
    let repairCalls = 0;
    let inventoryCalls = 0;
    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      planLoopCycle: () => ({
        outcome: "ready" as const,
        candidate: fixtureCandidate(),
        plannedSteps: [],
        snapshot: fixtureSnapshot(fixtureProject(), fixtureCandidate()),
        authorizedBy: "execution_decision" as const,
        allowedPaths: ["src/**"],
      }),
      maxRepairs: 1,
      readModifiedWorktreeFiles: async () =>
        inventoryCalls++ === 0
          ? ["src/feature.ts"]
          : ["src/feature.ts", "docs/outside.md"],
      executor: async () => ({
        status: "completed",
        modifiedFiles: ["src/feature.ts"],
        details: [],
      }),
      validator: async () => {
        validatorCalls += 1;
        return {
          status: "failed",
          failedCommand: "pnpm run typecheck",
          exitCode: 1,
          details: [],
        };
      },
      repairer: async () => {
        repairCalls += 1;
        return {
          status: "completed",
          modifiedFiles: ["docs/outside.md"],
          details: [],
        };
      },
    });

    assert.equal(validatorCalls, 1);
    assert.equal(repairCalls, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "scope_violation");
    assert.equal(result.validation?.status, "failed");
    assert.equal(result.validation?.attempts, 1);
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
  });

  it("prioritizes scope violation when a failed repair modifies outside the authorized scope", async () => {
    let validatorCalls = 0;
    let repairCalls = 0;
    let inventoryCalls = 0;
    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      planLoopCycle: () => ({
        outcome: "ready" as const,
        candidate: fixtureCandidate(),
        plannedSteps: [],
        snapshot: fixtureSnapshot(fixtureProject(), fixtureCandidate()),
        authorizedBy: "execution_decision" as const,
        allowedPaths: ["src/**"],
      }),
      maxRepairs: 1,
      readModifiedWorktreeFiles: async () =>
        inventoryCalls++ === 0
          ? ["src/feature.ts"]
          : ["src/feature.ts", "docs/outside.md"],
      executor: async () => ({
        status: "completed",
        modifiedFiles: ["src/feature.ts"],
        details: [],
      }),
      validator: async () => {
        validatorCalls += 1;
        return {
          status: "failed",
          failedCommand: "pnpm run typecheck",
          exitCode: 1,
          details: [],
        };
      },
      repairer: async () => {
        repairCalls += 1;
        return {
          status: "failed",
          modifiedFiles: ["docs/outside.md"],
          failure: {
            code: "repair_rejected",
            message: "Repair failed after a partial edit.",
            details: ["Stable repair failure."],
          },
        };
      },
    });

    assert.equal(validatorCalls, 1);
    assert.equal(repairCalls, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "scope_violation");
    assert.match(result.failure?.details.join("\n") ?? "", /docs\/outside\.md/);
    assert.equal(result.validation?.attempts, 1);
    assert.equal(result.validation?.repairAttempts, 1);
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
  });

  it("executes once, validates once and reports modified files without commit", async () => {
    let executorCalls = 0;
    let validatorCalls = 0;
    const progress: string[] = [];

    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      onProgress: (event) => {
        progress.push(event.status);
      },
      readModifiedWorktreeFiles: async () => ["src/feature.ts"],
      executor: async () => {
        executorCalls += 1;
        return {
          status: "completed",
          modifiedFiles: ["src/feature.ts", "src/feature.ts"],
          details: ["Injected executor completed."],
        };
      },
      validator: async ({ attempt }) => {
        validatorCalls += 1;
        return {
          status: "passed",
          failedCommand: null,
          exitCode: 0,
          details: [`Validation attempt ${attempt} passed.`],
        };
      },
    });

    assert.equal(executorCalls, 1);
    assert.equal(validatorCalls, 1);
    assert.equal(result.mode, "execute");
    assert.equal(result.status, "completed");
    assert.equal(result.agentPolicy?.mode, "execute");
    assert.equal(result.validation?.status, "passed");
    assert.equal(result.validation?.attempts, 1);
    assert.equal(result.validation?.repairAttempts, 0);
    assert.deepEqual(result.modifiedFiles, ["src/feature.ts"]);
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
    assert.equal(result.failure, null);
    assert.deepEqual(
      result.steps.map((step) => step.name),
      ["planning", "ready", "executing", "validating", "completed"],
    );
    assert.deepEqual(progress, [
      "planning",
      "ready",
      "executing",
      "validating",
      "completed",
    ]);
  });

  it("repairs once and revalidates within the finite budget", async () => {
    let validationCalls = 0;
    let repairCalls = 0;
    let inventoryCalls = 0;

    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      readModifiedWorktreeFiles: async () =>
        inventoryCalls++ === 0
          ? ["src/feature.ts"]
          : ["src/feature.ts", "tests/feature.test.ts"],
      maxRepairs: 1,
      executor: async () => ({
        status: "completed",
        modifiedFiles: ["src/feature.ts"],
        details: ["Execution completed."],
      }),
      validator: async ({ attempt }) => {
        validationCalls += 1;
        return attempt === 1
          ? {
              status: "failed",
              failedCommand: "pnpm run typecheck",
              exitCode: 1,
              details: ["Typecheck failed."],
            }
          : {
              status: "passed",
              failedCommand: null,
              exitCode: 0,
              details: ["Validation passed after repair."],
            };
      },
      repairer: async ({ attempt, maxRepairs }) => {
        repairCalls += 1;
        assert.equal(attempt, 1);
        assert.equal(maxRepairs, 1);
        return {
          status: "completed",
          modifiedFiles: ["tests/feature.test.ts"],
          details: ["Repair completed."],
        };
      },
    });

    assert.equal(validationCalls, 2);
    assert.equal(repairCalls, 1);
    assert.equal(result.status, "completed");
    assert.equal(result.validation?.attempts, 2);
    assert.equal(result.validation?.repairAttempts, 1);
    assert.deepEqual(result.modifiedFiles, [
      "src/feature.ts",
      "tests/feature.test.ts",
    ]);
    assert.deepEqual(
      result.steps.map((step) => step.name),
      [
        "planning",
        "ready",
        "executing",
        "validating",
        "repairing",
        "validating",
        "completed",
      ],
    );
  });

  it("fails closed after the repair budget is exhausted", async () => {
    let repairCalls = 0;

    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      maxRepairs: 1,
      executor: async () => ({
        status: "completed",
        modifiedFiles: ["src/feature.ts"],
        details: ["Execution completed."],
      }),
      validator: async () => ({
        status: "failed",
        failedCommand: "pnpm run audit:strict",
        exitCode: 1,
        details: ["Audit failed."],
      }),
      repairer: async () => {
        repairCalls += 1;
        return {
          status: "completed",
          modifiedFiles: ["src/repair.ts"],
          details: ["Repair attempted."],
        };
      },
    });

    assert.equal(repairCalls, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "validation_failed");
    assert.equal(result.validation?.attempts, 2);
    assert.equal(result.validation?.repairAttempts, 1);
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
  });

  it("counts a repairer-declared failure as an attempted repair", async () => {
    let inventoryCalls = 0;
    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      readModifiedWorktreeFiles: async () =>
        inventoryCalls++ === 0
          ? ["src/feature.ts"]
          : ["src/feature.ts", "src/partial-repair.ts"],
      maxRepairs: 1,
      executor: async () => ({
        status: "completed",
        modifiedFiles: ["src/feature.ts"],
        details: ["Execution completed."],
      }),
      validator: async () => ({
        status: "failed",
        failedCommand: "pnpm run typecheck",
        exitCode: 1,
        details: ["Typecheck failed."],
      }),
      repairer: async () => ({
        status: "failed",
        modifiedFiles: ["src/partial-repair.ts"],
        failure: {
          code: "repair_rejected",
          message: "Repair was rejected.",
          details: ["Stable repair failure."],
        },
      }),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "repair_rejected");
    assert.equal(result.validation?.attempts, 1);
    assert.equal(result.validation?.repairAttempts, 1);
    assert.deepEqual(result.modifiedFiles, [
      "src/feature.ts",
      "src/partial-repair.ts",
    ]);
  });

  it("counts a thrown repairer call without exposing its exception", async () => {
    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      maxRepairs: 1,
      executor: async () => ({
        status: "completed",
        modifiedFiles: ["src/feature.ts"],
        details: ["Execution completed."],
      }),
      validator: async () => ({
        status: "failed",
        failedCommand: "pnpm run typecheck",
        exitCode: 1,
        details: ["Typecheck failed."],
      }),
      repairer: async () => {
        throw new Error("sensitive repair stack");
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "repair_failed");
    assert.equal(result.validation?.attempts, 1);
    assert.equal(result.validation?.repairAttempts, 1);
    assert.equal(
      JSON.stringify(result).includes("sensitive repair stack"),
      false,
    );
  });

  it("never calls the executor when execute policy admission fails", async () => {
    let executorCalls = 0;

    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      agentRegistry: { profiles: [] },
      executor: async () => {
        executorCalls += 1;
        return {
          status: "completed",
          modifiedFiles: [],
          details: [],
        };
      },
    });

    assert.equal(executorCalls, 0);
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "agent_policy_rejected");
    assert.equal(result.validation, null);
    assert.deepEqual(result.modifiedFiles, []);
  });

  it("performs exactly one same-provider model escalation after validation failure when explicitly authorized", async () => {
    const registry = createAgentRegistry([
      escalationProfile({
        id: "economy",
        model: "economy-model",
        economicTier: "economy",
      }),
      escalationProfile({
        id: "standard",
        model: "standard-model",
        economicTier: "standard",
      }),
      escalationProfile({
        id: "advanced",
        model: "advanced-model",
        economicTier: "advanced",
      }),
    ]);
    const observedPlans: Array<{
      profileId: string;
      provider: string;
      runtime: string;
      model: string;
      effort: string;
    }> = [];
    let executorCalls = 0;
    let validatorCalls = 0;

    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      agentPolicy: {
        ...DEFAULT_AGENT_POLICY,
        allowEscalation: true,
      },
      agentRegistry: registry,
      maxRepairs: 0,
      readModifiedWorktreeFiles: async () => ["src/feature.ts"],
      executor: async (plan) => {
        executorCalls += 1;
        observedPlans.push({
          profileId: plan.profileId,
          provider: plan.provider,
          runtime: plan.runtime,
          model: plan.model,
          effort: plan.effort,
        });
        return {
          status: "completed",
          modifiedFiles: ["src/feature.ts"],
          details: [`Executor call ${executorCalls} completed.`],
        };
      },
      validator: async ({ attempt }) => {
        validatorCalls += 1;
        return attempt === 1
          ? {
              status: "failed",
              failedCommand: "pnpm run test",
              exitCode: 1,
              details: ["Validation failed on the economy profile."],
            }
          : {
              status: "passed",
              failedCommand: null,
              exitCode: 0,
              details: ["Validation passed after one model escalation."],
            };
      },
    });

    assert.equal(result.status, "completed");
    assert.equal(executorCalls, 2);
    assert.equal(validatorCalls, 2);
    assert.deepEqual(
      observedPlans.map((plan) => plan.profileId),
      ["economy", "standard"],
    );
    assert.deepEqual(
      observedPlans.map((plan) => [plan.provider, plan.runtime]),
      [
        ["openai", "codex"],
        ["openai", "codex"],
      ],
    );
    assert.deepEqual(
      observedPlans.map((plan) => plan.effort),
      ["medium", "medium"],
    );
    assert.equal(result.validation?.attempts, 2);
    assert.equal(result.validation?.repairAttempts, 0);
    assert.deepEqual(result.modelEscalationEvidence, {
      schemaVersion: 1,
      reason: "validation_failed",
      outcome: "escalated",
      maxCalls: 2,
      callsUsed: 2,
      from: {
        profileId: "economy",
        provider: "openai",
        runtime: "codex",
        model: "economy-model",
        economicTier: "economy",
      },
      to: {
        profileId: "standard",
        provider: "openai",
        runtime: "codex",
        model: "standard-model",
        economicTier: "standard",
      },
      detail: null,
    });
    assert.deepEqual(
      result.steps.map((step) => step.name),
      [
        "planning",
        "ready",
        "executing",
        "validating",
        "escalating",
        "validating",
        "completed",
      ],
    );
  });

  it("never performs more than one model escalation even when the second validation also fails", async () => {
    const registry = createAgentRegistry([
      escalationProfile({
        id: "economy",
        model: "economy-model",
        economicTier: "economy",
      }),
      escalationProfile({
        id: "standard",
        model: "standard-model",
        economicTier: "standard",
      }),
      escalationProfile({
        id: "advanced",
        model: "advanced-model",
        economicTier: "advanced",
      }),
    ]);
    let executorCalls = 0;

    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      agentPolicy: {
        ...DEFAULT_AGENT_POLICY,
        allowEscalation: true,
      },
      agentRegistry: registry,
      maxRepairs: 0,
      readModifiedWorktreeFiles: async () => ["src/feature.ts"],
      executor: async () => {
        executorCalls += 1;
        return {
          status: "completed",
          modifiedFiles: ["src/feature.ts"],
          details: [],
        };
      },
      validator: async () => ({
        status: "failed",
        failedCommand: "pnpm run test",
        exitCode: 1,
        details: ["Still failing."],
      }),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "validation_failed");
    assert.equal(executorCalls, 2);
    assert.equal(result.validation?.attempts, 2);
    assert.equal(result.modelEscalationEvidence?.outcome, "escalated");
    assert.equal(result.modelEscalationEvidence?.callsUsed, 2);
  });

  it("does not stack model escalation on top of multi-attempt provider failover", async () => {
    const registry = createAgentRegistry([
      escalationProfile({
        id: "economy",
        model: "economy-model",
        economicTier: "economy",
      }),
      escalationProfile({
        id: "standard",
        model: "standard-model",
        economicTier: "standard",
      }),
    ]);
    let executorCalls = 0;

    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      agentPolicy: {
        ...DEFAULT_AGENT_POLICY,
        allowEscalation: true,
      },
      agentRegistry: registry,
      maxRepairs: 0,
      readModifiedWorktreeFiles: async () => ["src/feature.ts"],
      executor: async (plan) => {
        executorCalls += 1;
        return {
          status: "completed",
          modifiedFiles: ["src/feature.ts"],
          details: [],
          providerFailoverEvidence: {
            schemaVersion: 1,
            maxAttempts: 2,
            attemptedProviders: ["openai"],
            selectedProvider: "openai",
            attempts: [
              {
                attempt: 1,
                provider: "openai",
                runtime: "codex",
                profileId: plan.profileId,
                model: plan.model,
                status: "completed",
                failureCode: null,
                recoverable: false,
              },
            ],
          },
        };
      },
      validator: async () => ({
        status: "failed",
        failedCommand: "pnpm run test",
        exitCode: 1,
        details: ["Validation failed."],
      }),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "validation_failed");
    assert.equal(executorCalls, 1);
    assert.deepEqual(result.modelEscalationEvidence, {
      schemaVersion: 1,
      reason: "validation_failed",
      outcome: "not_authorized",
      maxCalls: 2,
      callsUsed: 1,
      from: {
        profileId: "economy",
        provider: "openai",
        runtime: "codex",
        model: "economy-model",
        economicTier: "economy",
      },
      to: null,
      detail: "provider_failover_already_controls_attempt_budget",
    });
  });

  it("fails closed when no concrete executor is configured", async () => {
    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "executor_unavailable");
    assert.equal(result.validation, null);
    assert.deepEqual(
      result.steps.map((step) => step.name),
      ["planning", "ready", "executing", "failed"],
    );
  });
});
