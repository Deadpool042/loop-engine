import assert from "node:assert/strict";
import test from "node:test";

import { generateCompletionEventsReport } from "../../src/commands/completion-events.js";
import type {
  LoopApplicationAssembly,
  LoopApplicationConfig,
} from "../../src/composition/index.js";

test("projects one stable ci.green event from the current terminal CI snapshot", async () => {
  const config = {
    projects: [{ name: "creatyss" }],
  } as unknown as LoopApplicationConfig;

  const application = {
    generateRoadmapOverviewReport() {
      return { roadmap: { selectedCandidate: null, completionEvent: null } };
    },
    generateProjectReport() {
      return {
        planning: { recommendation: "roadmap_configured", voluntaryNoWork: false },
        roadmap: { candidates: [], phaseGates: [] },
        git: { lastCommit: null },
      };
    },
  } as unknown as LoopApplicationAssembly;

  const ciSnapshot = {
    schemaVersion: 1 as const,
    project: "creatyss",
    repository: "Deadpool042/CREATYSS",
    sha: "a".repeat(40),
    conclusion: "success" as const,
    workflow: "CI",
    runId: "123456789",
    runAttempt: 2,
    runUrl: "https://github.com/Deadpool042/CREATYSS/actions/runs/123456789",
    prNumber: 524,
    branch: "test/vnext3-g3-m13-gifting-checkout-e2e",
    occurredAt: "2026-09-10T12:00:00.000Z",
  };

  const first = await generateCompletionEventsReport(application, config, {
    readCiEvent(project) {
      assert.equal(project, "creatyss");
      return ciSnapshot;
    },
  });
  const second = await generateCompletionEventsReport(application, config, {
    readCiEvent() {
      return ciSnapshot;
    },
  });

  assert.deepEqual(first.errors, []);
  assert.equal(first.events.length, 1);
  assert.deepEqual(first.events[0], {
    schemaVersion: 1,
    type: "ci.green",
    eventId: (first.events[0] as { eventId: string }).eventId,
    project: { name: "creatyss" },
    repository: "Deadpool042/CREATYSS",
    sha: "a".repeat(40),
    conclusion: "success",
    workflow: "CI",
    run: {
      id: "123456789",
      attempt: 2,
      url: "https://github.com/Deadpool042/CREATYSS/actions/runs/123456789",
    },
    pr: { number: 524 },
    branch: "test/vnext3-g3-m13-gifting-checkout-e2e",
    occurredAt: "2026-09-10T12:00:00.000Z",
  });
  assert.match((first.events[0] as { eventId: string }).eventId, /^[a-f0-9]{32}$/);
  assert.equal(
    (second.events[0] as { eventId: string }).eventId,
    (first.events[0] as { eventId: string }).eventId,
  );
});

test("maps cancelled CI snapshots to ci.failed without querying execution status", async () => {
  const config = {
    projects: [{ name: "creatyss" }],
  } as unknown as LoopApplicationConfig;

  const application = {
    generateRoadmapOverviewReport() {
      return { roadmap: { selectedCandidate: null, completionEvent: null } };
    },
    generateProjectReport() {
      return {
        planning: { recommendation: "roadmap_configured", voluntaryNoWork: false },
        roadmap: { candidates: [], phaseGates: [] },
        git: { lastCommit: null },
      };
    },
    async generateExecutionStatusReport() {
      throw new Error("must not be called without a selected candidate");
    },
  } as unknown as LoopApplicationAssembly;

  const report = await generateCompletionEventsReport(application, config, {
    readCiEvent() {
      return {
        schemaVersion: 1,
        project: "creatyss",
        repository: "Deadpool042/CREATYSS",
        sha: "b".repeat(40),
        conclusion: "cancelled",
        workflow: "CI",
        runId: "987654321",
        runAttempt: 1,
        runUrl: "https://github.com/Deadpool042/CREATYSS/actions/runs/987654321",
        prNumber: 525,
        branch: "test/example",
        occurredAt: "2026-09-10T12:10:00.000Z",
      };
    },
  });

  assert.equal((report.events[0] as { type: string }).type, "ci.failed");
  assert.equal((report.events[0] as { conclusion: string }).conclusion, "cancelled");
});
