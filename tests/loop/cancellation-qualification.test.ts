import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { ProjectSnapshot } from "../../src/intelligence/snapshot.js";
import { runLoopCommit } from "../../src/loop/commit-runner.js";
import { runLoopExecute } from "../../src/loop/execute-runner.js";
import type { LoopExecutor, LoopValidator } from "../../src/loop/execution.js";
import { watchChildForCancellation } from "../../src/loop/process-termination.js";
import { DEFAULT_AGENT_POLICY } from "../../src/policy/defaults.js";

// Qualification finale de #410 — lacunes de couverture relevées après la revue :
// 1. le troisième site d'appel de l'exécuteur (réparation de complétion) n'était
//    couvert que structurellement ;
// 2. aucun test ne montrait qu'un run annulé ne peut pas être committé ;
// 3. l'observateur d'enfant déclarait « terminé » un enfant hors groupe (cas
//    sans groupe de processus) sans aucune observation.

function project(): ProjectConfig {
  return {
    name: "cancellation-qualification",
    path: ".",
    type: "test",
    required_docs: [],
    validation: ["fixture-validation"],
    roadmap: ["roadmap.md"],
  };
}

function candidate(): RoadmapCandidate {
  return {
    id: "L7-QUAL",
    path: "roadmap.md",
    line: 1,
    text: "- [ ] L7-QUAL — governed work",
    kind: "safe",
    reason: "fixture",
    status: "todo",
    priority: "p1",
  };
}

function snapshot(): ProjectSnapshot {
  const fixtureProject = project();
  const fixtureCandidate = candidate();
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
    validation: { commands: fixtureProject.validation, configured: true },
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
      summary: { active: 1, done: 0, selectable: 1, hasBlocked: false },
    },
    health: "good",
  };
}

function baseOptions() {
  const fixtureProject = project();
  let tick = 0;
  return {
    now: () => `2026-11-07T10:00:${String(tick++ % 60).padStart(2, "0")}.000Z`,
    generateRunId: () => "run-l7-qualification",
    loadConfig: (): Config => ({ projects: [fixtureProject] }),
    buildMinimalContext: () => ({
      project: fixtureProject.name,
      budget: { maxFiles: 8, maxCharacters: 32_000, maxEstimatedTokens: 8_000 },
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
    readModifiedWorktreeFiles: async () => ["roadmap.md"] as readonly string[],
  };
}

/** The candidate stays open after validation: the completion repair is needed. */
function openCycle() {
  return {
    outcome: "ready" as const,
    candidate: candidate(),
    plannedSteps: [],
    snapshot: snapshot(),
    authorizedBy: "execution_decision" as const,
    allowedPaths: ["roadmap.md"] as readonly string[],
  };
}

const passing: LoopValidator = async () => ({
  status: "passed",
  failedCommand: null,
  exitCode: 0,
  details: ["passed"],
});
const done = async () => ({
  status: "completed" as const,
  modifiedFiles: ["roadmap.md"] as readonly string[],
  details: ["synthetic"],
});

describe("réparation de complétion (3e site d'appel) sous annulation", () => {
  it("CR1 — annulation pendant l'appel de la réparation de complétion : cancelled, aucune revalidation", async () => {
    const controller = new AbortController();
    let executorCalls = 0;
    let validatorCalls = 0;
    const result = await runLoopExecute("cancellation-qualification", {
      ...baseOptions(),
      signal: controller.signal,
      maxRepairs: 0,
      planLoopCycle: () => openCycle(),
      executor: (async () => {
        executorCalls += 1;
        // Second call = the dedicated completion repair.
        if (executorCalls === 2) controller.abort();
        return done();
      }) satisfies LoopExecutor,
      validator: (async (input) => {
        validatorCalls += 1;
        return passing(input);
      }) satisfies LoopValidator,
    });

    assert.equal(result.status, "cancelled");
    assert.equal(result.failure?.code, "execution_cancelled");
    assert.equal(
      executorCalls,
      2,
      "la réparation de complétion a bien été appelée",
    );
    assert.equal(validatorCalls, 1, "aucune revalidation après l'annulation");
    assert.equal(
      result.steps.filter((step) => step.name === "completion_repair").length,
      1,
    );
  });

  it("CR2 — exception de la réparation de complétion sous annulation : cancelled, pas completion_repair_failed", async () => {
    const controller = new AbortController();
    let executorCalls = 0;
    const result = await runLoopExecute("cancellation-qualification", {
      ...baseOptions(),
      signal: controller.signal,
      maxRepairs: 0,
      planLoopCycle: () => openCycle(),
      executor: (async () => {
        executorCalls += 1;
        if (executorCalls === 2) {
          controller.abort();
          throw new Error("provider exploded");
        }
        return done();
      }) satisfies LoopExecutor,
      validator: passing,
    });

    assert.equal(result.status, "cancelled");
    assert.notEqual(result.failure?.code, "completion_repair_failed");
    assert.equal(executorCalls, 2);
  });

  it("CR3 — annulation observée à la validation : aucune réparation de complétion n'est lancée", async () => {
    const controller = new AbortController();
    let executorCalls = 0;
    let planCalls = 0;
    const result = await runLoopExecute("cancellation-qualification", {
      ...baseOptions(),
      signal: controller.signal,
      maxRepairs: 0,
      planLoopCycle: () => {
        planCalls += 1;
        return openCycle();
      },
      executor: (async () => {
        executorCalls += 1;
        return done();
      }) satisfies LoopExecutor,
      validator: (async (input) => {
        const verdict = await passing(input);
        controller.abort();
        return verdict;
      }) satisfies LoopValidator,
    });

    assert.equal(result.status, "cancelled");
    assert.equal(executorCalls, 1, "pas de seconde exécution");
    assert.equal(planCalls, 1, "pas de relecture de complétion");
    assert.equal(
      result.steps.some((step) => step.name === "completion_repair"),
      false,
    );
  });
});

describe("un run annulé ne peut pas être committé", () => {
  it("CM1 — runLoopCommit n'appelle jamais le committer après une annulation, même validation réussie", async () => {
    const controller = new AbortController();
    let commits = 0;
    const result = await runLoopCommit("cancellation-qualification", {
      ...baseOptions(),
      signal: controller.signal,
      maxRepairs: 0,
      planLoopCycle: () => openCycle(),
      executor: (async () => {
        controller.abort();
        return done();
      }) satisfies LoopExecutor,
      validator: passing,
      commitMessage: "feat: must never be committed",
      committer: async () => {
        commits += 1;
        return { committed: true as const, sha: "a".repeat(40) } as never;
      },
    } as never);

    assert.equal(commits, 0);
    assert.equal(result.status, "cancelled");
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
  });
});

describe("observateur d'enfant sans groupe de processus", () => {
  it("W7 — un enfant démarré mais hors groupe n'est jamais déclaré terminé sans preuve", async () => {
    const outcomes: string[] = [];
    const kills: (NodeJS.Signals | undefined)[] = [];
    const controller = new AbortController();
    watchChildForCancellation(
      {
        pid: 4242,
        kill: (signal) => {
          kills.push(signal);
          return true;
        },
      },
      controller.signal,
      false,
      (outcome) => void outcomes.push(outcome),
    );
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(kills, ["SIGKILL"], "l'enfant direct reçoit SIGKILL");
    assert.deepEqual(
      outcomes,
      ["cleanup_failed"],
      "sans groupe, ni descendants ni disparition ne sont observés : arrêt non confirmé",
    );
  });

  it("W8 — un enfant jamais démarré (pas de pid) n'a rien à terminer : terminé", async () => {
    const outcomes: string[] = [];
    const kills: (NodeJS.Signals | undefined)[] = [];
    const controller = new AbortController();
    watchChildForCancellation(
      {
        kill: (signal) => {
          kills.push(signal);
          return false;
        },
      },
      controller.signal,
      false,
      (outcome) => void outcomes.push(outcome),
    );
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(outcomes, ["terminated"]);
  });
});
