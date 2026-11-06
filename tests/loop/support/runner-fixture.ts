import type { Config, ProjectConfig } from "../../../src/core/config.js";
import type { RoadmapCandidate } from "../../../src/intelligence/roadmap.js";
import type { ProjectSnapshot } from "../../../src/intelligence/snapshot.js";
import type { ContextBudget } from "../../../src/policy/types.js";

/**
 * Synthetic, fully deterministic dependencies for `runLoopExecute`. No real
 * project, provider, Git repository or network is involved. The counters let a
 * test prove that no operation started after a cancellation was observed.
 */
export type RunnerFixtureCounters = {
  loadConfig: number;
  planLoopCycle: number;
  readModifiedWorktreeFiles: number;
};

export function createRunnerFixture(): Readonly<{
  options: Record<string, unknown>;
  counters: RunnerFixtureCounters;
}> {
  const project: ProjectConfig = {
    name: "cancellation-fixture",
    path: ".",
    type: "test",
    required_docs: [],
    validation: ["fixture-validation"],
    roadmap: ["roadmap.md"],
  };
  const candidate: RoadmapCandidate = {
    path: "roadmap.md",
    line: 1,
    text: "- [ ] Implement a small code change with tests",
    kind: "safe",
    reason: "fixture",
    status: "todo",
    priority: "default",
  };
  const snapshot: ProjectSnapshot = {
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
  const counters: RunnerFixtureCounters = {
    loadConfig: 0,
    planLoopCycle: 0,
    readModifiedWorktreeFiles: 0,
  };
  let tick = 0;

  return Object.freeze({
    counters,
    options: {
      now: () =>
        `2026-08-24T00:00:${String(tick++ % 60).padStart(2, "0")}.000Z`,
      generateRunId: () => "cancellation-run",
      loadConfig: (): Config => {
        counters.loadConfig += 1;
        return { projects: [project] };
      },
      planLoopCycle: () => {
        counters.planLoopCycle += 1;
        return {
          outcome: "ready" as const,
          candidate,
          plannedSteps: ["Execute", "Validate"],
          snapshot,
        };
      },
      buildMinimalContext: (
        _snapshot: ProjectSnapshot,
        budget: ContextBudget,
      ) => ({
        project: project.name,
        budget,
        files: [],
        omitted: [],
        totalCharacters: 0,
        estimatedTokens: 0,
        truncated: false,
      }),
      readModifiedWorktreeFiles: async () => {
        counters.readModifiedWorktreeFiles += 1;
        return [] as readonly string[];
      },
    },
  });
}
