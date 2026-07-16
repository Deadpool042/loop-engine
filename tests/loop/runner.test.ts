import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
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

    const result = runLoopPlan(project.name, {
      ...deterministicOptions(),
      loadConfig: () => fixtureConfig(project),
      planLoopCycle: () => ({ outcome: "ready", candidate: fixtureCandidate("safe"), plannedSteps: [] }),
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
  });

  it("fails when the project is unknown", () => {
    const result = runLoopPlan("does-not-exist", {
      ...deterministicOptions(),
      loadConfig: () => ({ projects: [] }),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "unknown_project");
    assert.equal(result.candidate, null);
  });

  it("never modifies the worktree, commits, or publishes regardless of the outcome", () => {
    const project = fixtureProject();

    const outcomes = [
      runLoopPlan(project.name, {
        ...deterministicOptions(),
        loadConfig: () => fixtureConfig(project),
        planLoopCycle: () => ({ outcome: "ready", candidate: fixtureCandidate("safe"), plannedSteps: [] }),
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
});
