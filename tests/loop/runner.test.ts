import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { ProjectSnapshot } from "../../src/intelligence/snapshot.js";
import { runLoopPlan } from "../../src/loop/runner.js";
import { canTransition } from "../../src/loop/state-machine.js";

function fixtureProject(): ProjectConfig {
  return {
    name: "fixture-project",
    path: ".",
    type: "test",
    required_docs: [],
    validation: [],
    roadmap: ["roadmap.md"],
  };
}

function fixtureSnapshot(project: ProjectConfig, candidate: RoadmapCandidate): ProjectSnapshot {
  return {
    project: { name: project.name, type: project.type, path: project.path },
    git: { branch: "main", clean: true, requiresGit: true, statusText: "", lastCommit: null },
    docs: { required: [], missing: [] },
    validation: { commands: [], configured: false },
    roadmap: {
      available: true,
      paths: ["roadmap.md"],
      candidates: [candidate],
      selectedCandidate: candidate,
      stats: { total: 1, todo: 1, inProgress: 0, done: 0, unknown: 0, safe: 1, warning: 0, blocked: 0 },
      summary: { active: 1, done: 0, selectable: 1, hasBlocked: false },
    },
    health: "good",
  };
}

function fixtureConfig(project: ProjectConfig): Config {
  return { projects: [project] };
}

function fixtureCandidate(kind: RoadmapCandidate["kind"] = "safe"): RoadmapCandidate {
  return {
    path: "roadmap.md",
    line: 3,
    text: "- [ ] Small safe micro-lot",
    kind,
    reason: kind === "safe" ? "no sensitive keyword detected" : "contains sensitive keyword",
    status: "todo",
    priority: "default",
  };
}

function deterministicOptions() {
  let tick = 0;

  return {
    now: () => `2026-01-01T00:00:0${tick++}.000Z`,
    generateRunId: () => "run-fixed-id",
  };
}

describe("runLoopPlan", () => {
  it("completes a successful plan cycle without touching the worktree", () => {
    const project = fixtureProject();
    const candidate = fixtureCandidate("safe");

    const result = runLoopPlan(project.name, {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => ({
        outcome: "ready",
        candidate,
        plannedSteps: ["Prepare context", "Prepare prompt"],
        snapshot: fixtureSnapshot(project, candidate),
      }),
    });

    assert.equal(result.schemaVersion, 1);
    assert.equal(result.runId, "run-fixed-id");
    assert.equal(result.project, project.name);
    assert.equal(result.mode, "plan");
    assert.equal(result.status, "completed");
    assert.equal(result.candidate?.text, candidate.text);
    assert.deepEqual(result.modifiedFiles, []);
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
    assert.equal(result.failure, null);
    assert.ok(result.agentPolicy, "a completed plan cycle exposes an agent policy forecast");
    assert.equal(result.agentPolicy?.mode, "plan");
    // The forecast never implies a real call: this run's own budget stays 0.
    assert.equal(result.agentPolicy?.requirements.executionBudget.maxCalls, 0);
    assert.ok(result.contextPackage, "a completed plan cycle exposes a context package");
    assert.equal(result.contextPackage?.project, project.name);
    assert.deepEqual(result.contextPackage?.budget, result.agentPolicy?.requirements.contextBudget);
    assert.ok(result.steps.length >= 3);
    assert.equal(result.steps.at(-1)?.name, "completed");
    assert.deepEqual(result.steps.at(-1)?.details, ["Prepare context", "Prepare prompt"]);
    assert.deepEqual(
      result.steps.map((step) => step.name),
      ["planning", "ready", "completed"],
    );
  });

  it("reaches completed through exactly one ready -> completed transition, never a direct assignment", () => {
    const project = fixtureProject();
    const candidate = fixtureCandidate("safe");

    const result = runLoopPlan(project.name, {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => ({
        outcome: "ready",
        candidate,
        plannedSteps: [],
        snapshot: fixtureSnapshot(project, candidate),
      }),
    });

    // Exactly one "planning", one "ready", one "completed" step: no bypass,
    // no duplicate terminal step, no completed -> completed no-op transition.
    assert.deepEqual(
      result.steps.map((step) => step.name),
      ["planning", "ready", "completed"],
    );
    assert.equal(result.steps.filter((step) => step.name === "completed").length, 1);
    assert.equal(canTransition("ready", "completed"), true);
    assert.equal(canTransition("completed", "completed"), false);
  });

  it("returns blocked when no roadmap candidate is available", () => {
    const project = fixtureProject();

    const result = runLoopPlan(project.name, {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => ({
        outcome: "blocked",
        candidate: null,
        reason: "No roadmap candidate available.",
      }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.candidate, null);
    assert.equal(result.failure?.code, "no_safe_candidate");
    assert.deepEqual(result.modifiedFiles, []);
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
    assert.equal(result.agentPolicy, null);
    assert.equal(result.contextPackage, null);
  });

  it("returns blocked when only a blocked candidate is available", () => {
    const project = fixtureProject();
    const candidate = fixtureCandidate("blocked");

    const result = runLoopPlan(project.name, {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => ({
        outcome: "blocked",
        candidate,
        reason: "Only a blocked roadmap candidate is available; choose a smaller safe prerequisite first.",
      }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.candidate?.kind, "blocked");
    assert.equal(result.failure?.code, "no_safe_candidate");
    assert.equal(result.agentPolicy, null);
    assert.equal(result.contextPackage, null);
  });

  it("fails when the project is unknown", () => {
    const result = runLoopPlan("does-not-exist", {
      ...deterministicOptions(),
      loadConfig: () => ({ projects: [] }),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "unknown_project");
    assert.equal(result.candidate, null);
    assert.equal(result.agentPolicy, null);
    assert.equal(result.contextPackage, null);
  });

  it("never modifies the worktree, commits, or publishes regardless of the outcome", () => {
    const project = fixtureProject();
    const readyCandidate = fixtureCandidate("safe");

    const outcomes = [
      runLoopPlan(project.name, {
        ...deterministicOptions(),
        loadConfig: () => fixtureConfig(project),
        planLoopCycle: () => ({
          outcome: "ready",
          candidate: readyCandidate,
          plannedSteps: [],
          snapshot: fixtureSnapshot(project, readyCandidate),
        }),
      }),
      runLoopPlan(project.name, {
        ...deterministicOptions(),
        loadConfig: () => fixtureConfig(project),
        planLoopCycle: () => ({ outcome: "blocked", candidate: null, reason: "none" }),
      }),
      runLoopPlan("does-not-exist", {
        ...deterministicOptions(),
        loadConfig: () => ({ projects: [] }),
      }),
    ];

    for (const outcome of outcomes) {
      assert.deepEqual(outcome.modifiedFiles, []);
      assert.equal(outcome.commit, null);
      assert.equal(outcome.publication, null);
      assert.equal(outcome.validation, null);
    }
  });

  it("computes the agent policy forecast via the injectable resolvePolicy — never a hardcoded call", () => {
    const project = fixtureProject();
    const candidate = fixtureCandidate("safe");
    let calls = 0;

    const contextBudget = { maxFiles: 1, maxCharacters: 1, maxEstimatedTokens: 1, includeFullFiles: false };

    const result = runLoopPlan(project.name, {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => ({
        outcome: "ready",
        candidate,
        plannedSteps: [],
        snapshot: fixtureSnapshot(project, candidate),
      }),
      resolvePolicy: (input) => {
        calls += 1;
        return {
          policyId: "fixture-policy",
          mode: input.mode,
          status: "no_compatible_agent",
          requirements: {
            category: "code",
            mode: input.mode,
            requiredCapabilities: [],
            requiredPermissions: [],
            minimumEffort: "low",
            maximumEffort: "low",
            contextBudget,
            executionBudget: { maxTokens: null, maxCostUsd: null, maxDurationMs: null, maxCalls: 0, maxRepairs: 0 },
            rationale: ["fixture"],
          },
          selectionRequest: { requiredCapabilities: [], requiredPermissions: [] },
          selection: null,
          reasons: ["fixture reason"],
        };
      },
    });

    assert.equal(calls, 1);
    assert.equal(result.agentPolicy?.policyId, "fixture-policy");
    assert.equal(result.agentPolicy?.status, "no_compatible_agent");
    // The context package always uses whatever contextBudget resolvePolicy
    // returned — resolvePolicy is the single source of truth for the budget,
    // never re-derived independently by the context builder integration.
    assert.deepEqual(result.contextPackage?.budget, contextBudget);
  });

  it("computes the context package via the injectable buildMinimalContext — never a hardcoded call", () => {
    const project = fixtureProject();
    const candidate = fixtureCandidate("safe");
    const snapshot = fixtureSnapshot(project, candidate);
    let calls = 0;
    let receivedBudget: unknown;

    const fixturePackage = {
      project: project.name,
      budget: { maxFiles: 0, maxCharacters: 0, maxEstimatedTokens: 0, includeFullFiles: false },
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    };

    const result = runLoopPlan(project.name, {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => ({ outcome: "ready", candidate, plannedSteps: [], snapshot }),
      buildMinimalContext: (receivedSnapshot, budget) => {
        calls += 1;
        receivedBudget = budget;
        assert.equal(receivedSnapshot, snapshot);
        return fixturePackage;
      },
    });

    assert.equal(calls, 1);
    assert.deepEqual(receivedBudget, result.agentPolicy?.requirements.contextBudget);
    assert.deepEqual(result.contextPackage, fixturePackage);
  });
});
