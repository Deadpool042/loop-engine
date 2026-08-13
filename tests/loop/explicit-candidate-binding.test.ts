import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { ProjectConfig } from "../../src/core/config.js";
import type { Config } from "../../src/core/config.js";
import { runLoopExecute } from "../../src/loop/execute-runner.js";
import { planLoopCycle } from "../../src/loop/planner.js";
import { runLoopPlan } from "../../src/loop/runner.js";

function withRoadmap(
  roadmap: string,
  run: (project: ProjectConfig) => void,
): void {
  const projectPath = mkdtempSync(join(tmpdir(), "loop-explicit-candidate-"));
  writeFileSync(join(projectPath, "roadmap.md"), roadmap);
  const project: ProjectConfig = {
    name: "fixture",
    path: projectPath,
    type: "test",
    required_docs: [],
    validation: [],
    roadmap: ["roadmap.md"],
    requires_git: false,
  };

  try {
    run(project);
  } finally {
    rmSync(projectPath, { recursive: true, force: true });
  }
}

describe("explicit roadmap candidate binding", () => {
  it("resolves the requested structured candidate instead of the default next candidate", () => {
    withRoadmap(
      [
        "| Lot | Deliverable | State |",
        "| --- | --- | --- |",
        "| H1-L5 | First default candidate | ⬜ À faire |",
        "| H1-L4 | Explicit requested candidate | ⬜ À faire |",
      ].join("\n"),
      (project) => {
        const defaultPlan = planLoopCycle(project);
        assert.equal(defaultPlan.outcome, "ready");
        assert.equal(defaultPlan.candidate.id, "H1-L5");

        const plan = planLoopCycle(project, { candidateId: "H1-L4" });

        assert.equal(plan.outcome, "ready");
        assert.equal(plan.candidate.id, "H1-L4");
        assert.match(plan.candidate.text, /Explicit requested candidate/);
      },
    );
  });

  it("fails closed for unknown, ambiguous, done, blocked, and unaddressable candidates", () => {
    const cases = [
      {
        name: "unknown",
        roadmap: "| H1-L4 | Known | ⬜ À faire |",
        candidateId: "H9-L9",
        code: "candidate_not_found",
      },
      {
        name: "ambiguous",
        roadmap: [
          "| H1-L4 | First | ⬜ À faire |",
          "| H1-L4 | Second | ⬜ À faire |",
        ].join("\n"),
        candidateId: "H1-L4",
        code: "candidate_ambiguous",
      },
      {
        name: "done",
        roadmap: "| H1-L4 | Completed | ✅ Terminé |",
        candidateId: "H1-L4",
        code: "candidate_done",
      },
      {
        name: "blocked",
        roadmap: "| H1-L4 | Production finale | ⬜ À faire |",
        candidateId: "H1-L4",
        code: "candidate_blocked",
      },
      {
        name: "not admissible",
        roadmap: "| H1-L4 | Pending clarification | En attente |",
        candidateId: "H1-L4",
        code: "candidate_not_admissible",
      },
      {
        name: "historical roadmap without identifiers",
        roadmap: "- [ ] Historical checklist item",
        candidateId: "H1-L4",
        code: "candidate_not_addressable",
      },
    ] as const;

    for (const testCase of cases) {
      withRoadmap(testCase.roadmap, (project) => {
        const plan = planLoopCycle(project, {
          candidateId: testCase.candidateId,
        });

        assert.equal(plan.outcome, "blocked", testCase.name);
        assert.equal(plan.code, testCase.code, testCase.name);
      });
    }
  });

  it("binds the same explicit candidate through plan and execute", async () => {
    const roadmap = [
      "| H1-L5 | Default candidate | ⬜ À faire |",
      "| H1-L4 | Confirmed candidate | ⬜ À faire |",
    ].join("\n");
    const projectPath = mkdtempSync(join(tmpdir(), "loop-explicit-run-"));
    writeFileSync(join(projectPath, "roadmap.md"), roadmap);
    const project: ProjectConfig = {
      name: "fixture",
      path: projectPath,
      type: "test",
      required_docs: [],
      validation: [],
      roadmap: ["roadmap.md"],
      requires_git: false,
    };
    const config: Config = { projects: [project] };

    try {
      const plan = runLoopPlan(project.name, {
        loadConfig: () => config,
        candidateId: "H1-L4",
      });
      assert.equal(plan.status, "completed");
      assert.equal(plan.candidate?.id, "H1-L4");

      let executedCandidateId: string | undefined;
      const execution = await runLoopExecute(project.name, {
        loadConfig: () => config,
        candidateId: "H1-L4",
        executor: async (executionPlan) => {
          executedCandidateId = executionPlan.candidate.id;
          return {
            status: "completed",
            modifiedFiles: [],
            details: ["Fake execution completed."],
          };
        },
        validator: async () => ({
          status: "passed",
          failedCommand: null,
          exitCode: 0,
          details: ["Fake validation passed."],
        }),
      });

      assert.equal(execution.status, "completed");
      assert.equal(execution.candidate?.id, "H1-L4");
      assert.equal(executedCandidateId, "H1-L4");
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("revalidates the confirmed candidate at execute time without substituting another one", async () => {
    const projectPath = mkdtempSync(join(tmpdir(), "loop-explicit-recheck-"));
    const roadmapPath = join(projectPath, "roadmap.md");
    const project: ProjectConfig = {
      name: "fixture",
      path: projectPath,
      type: "test",
      required_docs: [],
      validation: [],
      roadmap: ["roadmap.md"],
      requires_git: false,
    };
    const config: Config = { projects: [project] };

    try {
      writeFileSync(
        roadmapPath,
        "| H1-L4 | Confirmed candidate | ⬜ À faire |\n| H1-L5 | Other candidate | ⬜ À faire |",
      );
      const plan = runLoopPlan(project.name, {
        loadConfig: () => config,
        candidateId: "H1-L4",
      });
      assert.equal(plan.status, "completed");

      writeFileSync(
        roadmapPath,
        "| H1-L4 | Confirmed candidate | ✅ Terminé |\n| H1-L5 | Other candidate | ⬜ À faire |",
      );
      let executorCalls = 0;
      const execution = await runLoopExecute(project.name, {
        loadConfig: () => config,
        candidateId: "H1-L4",
        executor: async () => {
          executorCalls += 1;
          return { status: "completed", modifiedFiles: [], details: [] };
        },
      });

      assert.equal(execution.status, "blocked");
      assert.equal(execution.failure?.code, "candidate_done");
      assert.equal(execution.candidate?.id, "H1-L4");
      assert.equal(executorCalls, 0);
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("rejects a confirmed candidate when its phase closes before execute", async () => {
    const projectPath = mkdtempSync(join(tmpdir(), "loop-phase-recheck-"));
    const roadmapPath = join(projectPath, "roadmap.md");
    const project: ProjectConfig = {
      name: "fixture",
      path: projectPath,
      type: "test",
      required_docs: [],
      validation: [],
      roadmap: ["roadmap.md"],
      requires_git: false,
    };
    const config: Config = { projects: [project] };

    try {
      writeFileSync(
        roadmapPath,
        [
          "<!-- loop-engine:phase-gate phase=H1 state=open -->",
          "| H1-L4 | Confirmed candidate | ⬜ À faire |",
          "| H1-L5 | Other candidate | ⬜ À faire |",
        ].join("\n"),
      );
      assert.equal(
        runLoopPlan(project.name, { loadConfig: () => config, candidateId: "H1-L4" }).status,
        "completed",
      );

      writeFileSync(
        roadmapPath,
        [
          "<!-- loop-engine:phase-gate phase=H1 state=closed blockedBy=H0-RC -->",
          "| H1-L4 | Confirmed candidate | ⬜ À faire |",
          "| H1-L5 | Other candidate | ⬜ À faire |",
        ].join("\n"),
      );
      const rejectedPlan = runLoopPlan(project.name, {
        loadConfig: () => config,
        candidateId: "H1-L4",
      });
      assert.equal(rejectedPlan.status, "blocked");
      assert.equal(rejectedPlan.failure?.code, "candidate_phase_closed");

      let executorCalls = 0;
      const execution = await runLoopExecute(project.name, {
        loadConfig: () => config,
        candidateId: "H1-L4",
        executor: async () => {
          executorCalls += 1;
          return { status: "completed", modifiedFiles: [], details: [] };
        },
      });

      assert.equal(execution.status, "blocked");
      assert.equal(execution.failure?.code, "candidate_phase_closed");
      assert.equal(execution.candidate?.id, "H1-L4");
      assert.equal(executorCalls, 0);
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });
});
