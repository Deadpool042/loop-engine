import assert from "node:assert/strict";
import test from "node:test";

import { generateCompletionEventsReport } from "../../src/commands/completion-events.js";
import type {
  LoopApplicationAssembly,
  LoopApplicationConfig,
} from "../../src/composition/index.js";

function canonicalProjectReport(
  options: Readonly<{
    gitHead?: string | null;
    planningRecommendation?: string;
    voluntaryNoWork?: boolean;
    candidates?: readonly unknown[];
    phaseGates?: readonly unknown[];
  }> = {},
) {
  return {
    planning: {
      recommendation: options.planningRecommendation ?? "roadmap_configured",
      voluntaryNoWork: options.voluntaryNoWork ?? false,
    },
    roadmap: {
      candidates: options.candidates ?? [],
      phaseGates: options.phaseGates ?? [],
    },
    git: {
      lastCommit:
        options.gitHead === undefined || options.gitHead === null
          ? null
          : { hash: options.gitHead },
    },
  };
}

test("aggregates completion events in project order and isolates project failures", async () => {
  const config = {
    projects: [
      { name: "alpha" },
      { name: "beta" },
      { name: "gamma" },
    ],
  } as unknown as LoopApplicationConfig;

  const application = {
    generateRoadmapOverviewReport(project: { name: string }) {
      if (project.name === "gamma") throw new Error("boom");
      return {
        roadmap: {
          selectedCandidate: null,
          completionEvent:
            project.name === "alpha"
              ? {
                  type: "lot.completed",
                  eventId: "a".repeat(32),
                  project: { name: "alpha" },
                  candidate: { id: "A1" },
                  nextCandidate: null,
                }
              : null,
        },
      };
    },
    async generateExecutionStatusReport() {
      return {
        project: "alpha",
        execution: null,
        telemetry: {
          tokens: { status: "unavailable", reason: "test" },
          costUsd: { status: "unavailable", reason: "test" },
        },
      };
    },
    generateProjectReport() {
      return canonicalProjectReport();
    },
  } as unknown as LoopApplicationAssembly;

  const report = await generateCompletionEventsReport(application, config);

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.events.length, 1);
  assert.deepEqual(report.events[0], {
    type: "lot.completed",
    eventId: "a".repeat(32),
    project: { name: "alpha" },
    candidate: { id: "A1" },
    nextCandidate: null,
  });
  assert.deepEqual(report.errors, [
    { project: "gamma", code: "overview_failed" },
  ]);
});

test("emits one stable gate.blocked event from the canonical blocked gate state", async () => {
  const config = {
    projects: [{ name: "alpha" }],
  } as unknown as LoopApplicationConfig;

  const application = {
    generateRoadmapOverviewReport() {
      return {
        roadmap: {
          selectedCandidate: null,
          completionEvent: null,
        },
      };
    },
    generateProjectReport() {
      return canonicalProjectReport({
        planningRecommendation: "gated_no_work",
        candidates: [
          {
            id: "H4-L1",
            phaseId: "H4",
            status: "todo",
            admissibility: {
              state: "not_admissible",
              reason: "phase_closed",
              blockedBy: "human-review",
            },
          },
        ],
        phaseGates: [
          {
            phaseId: "H4",
            state: "closed",
            blockedBy: "human-review",
          },
        ],
      });
    },
    async generateExecutionStatusReport() {
      throw new Error("execution status must not be queried without a selected candidate");
    },
  } as unknown as LoopApplicationAssembly;

  const first = await generateCompletionEventsReport(application, config);
  const second = await generateCompletionEventsReport(application, config);

  assert.deepEqual(first.errors, []);
  assert.equal(first.events.length, 1);
  assert.equal(second.events.length, 1);

  const firstEvent = first.events[0] as {
    schemaVersion: number;
    type: string;
    eventId: string;
    project: { name: string };
    candidate: { id: string };
    gate: { fingerprint: string };
  };
  const secondEvent = second.events[0] as typeof firstEvent;

  assert.deepEqual(firstEvent, {
    schemaVersion: 1,
    type: "gate.blocked",
    eventId: firstEvent.eventId,
    project: { name: "alpha" },
    candidate: { id: "H4-L1" },
    gate: { fingerprint: firstEvent.gate.fingerprint },
  });
  assert.match(firstEvent.eventId, /^[a-f0-9]{32}$/);
  assert.match(firstEvent.gate.fingerprint, /^[a-f0-9]{32}$/);
  assert.equal(secondEvent.eventId, firstEvent.eventId);
  assert.equal(secondEvent.gate.fingerprint, firstEvent.gate.fingerprint);
});

test("does not emit gate.blocked for voluntary no-work or an exhausted roadmap", async () => {
  const config = {
    projects: [{ name: "maintenance" }, { name: "exhausted" }],
  } as unknown as LoopApplicationConfig;

  const application = {
    generateRoadmapOverviewReport() {
      return {
        roadmap: {
          selectedCandidate: null,
          completionEvent: null,
        },
      };
    },
    generateProjectReport(project: { name: string }) {
      if (project.name === "maintenance") {
        return canonicalProjectReport({
          planningRecommendation: "maintenance_no_work",
          voluntaryNoWork: true,
          candidates: [
            {
              id: "H4-L1",
              phaseId: "H4",
              status: "todo",
              admissibility: {
                state: "not_admissible",
                reason: "phase_closed",
              },
            },
          ],
          phaseGates: [{ phaseId: "H4", state: "closed" }],
        });
      }

      return canonicalProjectReport({
        planningRecommendation: "roadmap_exhausted_objective_available",
      });
    },
    async generateExecutionStatusReport() {
      throw new Error("execution status must not be queried without a selected candidate");
    },
  } as unknown as LoopApplicationAssembly;

  const report = await generateCompletionEventsReport(application, config);
  assert.deepEqual(report.events, []);
  assert.deepEqual(report.errors, []);
});

test("emits one current execution.failed event bound to the canonical candidate and Git SHA", async () => {
  const gitHead = "1".repeat(40);
  const config = {
    projects: [{ name: "creatyss" }],
  } as unknown as LoopApplicationConfig;

  const application = {
    generateRoadmapOverviewReport() {
      return {
        roadmap: {
          selectedCandidate: { id: "VNEXT3-G1B3A" },
          completionEvent: null,
        },
      };
    },
    generateProjectReport() {
      return canonicalProjectReport({ gitHead });
    },
    async generateExecutionStatusReport() {
      return {
        schemaVersion: 1,
        project: "creatyss",
        execution: {
          idempotencyKey:
            `auto-subscription:creatyss:VNEXT3-G1B3A:${gitHead}`,
          candidateId: "VNEXT3-G1B3A",
          expectedGitHead: gitHead,
          state: "failed",
          attempt: 1,
          createdAt: "2026-09-07T01:15:53.508Z",
          updatedAt: "2026-09-07T01:18:40.288Z",
          runId: "run-1",
          progress: {
            status: "failed",
            step: "failed",
            percent: 100,
            percentSource: "terminal",
            elapsedMs: 1,
            expectedDurationMs: 1,
            remainingMs: 0,
            etaState: "terminal",
          },
          executor: {
            profileId: "configured.claude_code.standard",
            provider: "anthropic",
            runtime: "claude_code",
            model: "claude-sonnet-5",
            effort: "low",
            fundingMode: "included_subscription",
            attempt: 2,
            maxAttempts: 2,
          },
          terminal: {
            runId: "run-1",
            status: "failed",
            failure: {
              code: "validation_failed",
              message: "Validation failed.",
              details: [],
            },
            validation: {
              status: "failed",
              attempts: 1,
              repairAttempts: 0,
              commands: ["pnpm run typecheck"],
              failedCommand: "pnpm run typecheck",
              exitCode: 1,
            },
            modifiedFiles: [],
            publication: null,
            modelEscalationEvidence: null,
            providerFailoverEvidence: null,
          },
        },
        telemetry: {
          tokens: { status: "unavailable", reason: "test" },
          costUsd: { status: "unavailable", reason: "test" },
        },
      };
    },
  } as unknown as LoopApplicationAssembly;

  const report = await generateCompletionEventsReport(application, config);
  assert.equal(report.errors.length, 0);
  assert.equal(report.events.length, 1);
  assert.deepEqual(report.events[0], {
    schemaVersion: 1,
    type: "execution.failed",
    eventId: (report.events[0] as { eventId: string }).eventId,
    project: { name: "creatyss" },
    candidate: { id: "VNEXT3-G1B3A" },
    runId: "run-1",
    occurredAt: "2026-09-07T01:18:40.288Z",
    failure: {
      code: "validation_failed",
      message: "Validation failed.",
      failedCommand: "pnpm run typecheck",
    },
    executor: {
      provider: "anthropic",
      runtime: "claude_code",
      model: "claude-sonnet-5",
      effort: "low",
      fundingMode: "included_subscription",
      attempt: 2,
      maxAttempts: 2,
    },
  });
  assert.match(
    (report.events[0] as { eventId: string }).eventId,
    /^[a-f0-9]{32}$/,
  );
});

test("suppresses a stale failure when the canonical Git SHA has moved", async () => {
  const config = {
    projects: [{ name: "creatyss" }],
  } as unknown as LoopApplicationConfig;

  const application = {
    generateRoadmapOverviewReport() {
      return {
        roadmap: {
          selectedCandidate: { id: "VNEXT3-G1B3A" },
          completionEvent: null,
        },
      };
    },
    generateProjectReport() {
      return canonicalProjectReport({ gitHead: "2".repeat(40) });
    },
    async generateExecutionStatusReport() {
      return {
        execution: {
          idempotencyKey: `auto-subscription:creatyss:VNEXT3-G1B3A:${"1".repeat(40)}`,
          candidateId: "VNEXT3-G1B3A",
          expectedGitHead: "1".repeat(40),
          state: "failed",
          runId: "run-1",
          updatedAt: "2026-09-07T01:18:40.288Z",
          executor: null,
          terminal: null,
        },
      };
    },
  } as unknown as LoopApplicationAssembly;

  const report = await generateCompletionEventsReport(application, config);
  assert.deepEqual(report.events, []);
  assert.deepEqual(report.errors, []);
});
