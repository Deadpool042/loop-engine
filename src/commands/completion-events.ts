import { createHash } from "node:crypto";

import type {
  LoopApplicationAssembly,
  LoopApplicationConfig,
} from "../composition/index.js";
import {
  ciTerminalEventType,
  readCiTerminalEvent,
} from "../core/ci-terminal-events.js";

export type CompletionEventsReport = Readonly<{
  schemaVersion: 1;
  events: readonly unknown[];
  errors: readonly Readonly<{
    project: string;
    code: "overview_failed" | "execution_status_failed" | "ci_event_failed";
  }>[];
}>;

function failureEventId(project: string, idempotencyKey: string): string {
  return createHash("sha256")
    .update("execution.failed")
    .update("\0")
    .update(project)
    .update("\0")
    .update(idempotencyKey)
    .digest("hex")
    .slice(0, 32);
}

function gateFingerprint(gate: Readonly<{
  phaseId: string;
  state: "open" | "closed";
  blockedBy?: string;
}>): string {
  return createHash("sha256")
    .update("gate.blocked.fingerprint")
    .update("\0")
    .update(gate.phaseId)
    .update("\0")
    .update(gate.state)
    .update("\0")
    .update(gate.blockedBy ?? "")
    .digest("hex")
    .slice(0, 32);
}

function gateBlockedEventId(
  project: string,
  candidateId: string,
  fingerprint: string,
): string {
  return createHash("sha256")
    .update("gate.blocked")
    .update("\0")
    .update(project)
    .update("\0")
    .update(candidateId)
    .update("\0")
    .update(fingerprint)
    .digest("hex")
    .slice(0, 32);
}

function ciTerminalEventId(input: Readonly<{
  project: string;
  sha: string;
  runId: string;
  runAttempt: number;
  conclusion: string;
}>): string {
  return createHash("sha256")
    .update("ci.terminal")
    .update("\0")
    .update(input.project)
    .update("\0")
    .update(input.sha.toLowerCase())
    .update("\0")
    .update(input.runId)
    .update("\0")
    .update(String(input.runAttempt))
    .update("\0")
    .update(input.conclusion)
    .digest("hex")
    .slice(0, 32);
}

function currentCiTerminalEvent(
  projectName: string,
  reader: typeof readCiTerminalEvent = readCiTerminalEvent,
) {
  const event = reader(projectName);
  if (event === null) return null;

  return Object.freeze({
    schemaVersion: 1 as const,
    type: ciTerminalEventType(event.conclusion),
    eventId: ciTerminalEventId(event),
    project: Object.freeze({ name: event.project }),
    repository: event.repository,
    sha: event.sha.toLowerCase(),
    conclusion: event.conclusion,
    workflow: event.workflow,
    run: Object.freeze({
      id: event.runId,
      attempt: event.runAttempt,
      url: event.runUrl,
    }),
    pr: event.prNumber === null ? null : Object.freeze({ number: event.prNumber }),
    branch: event.branch,
    occurredAt: event.occurredAt,
  });
}

function currentGateBlockedEvent(
  project: LoopApplicationConfig["projects"][number],
  projectReport: ReturnType<LoopApplicationAssembly["generateProjectReport"]>,
) {
  if (
    projectReport.planning.recommendation !== "gated_no_work" ||
    projectReport.planning.voluntaryNoWork
  ) {
    return null;
  }

  const candidate = projectReport.roadmap.candidates.find(
    (item) => item.status === "todo" || item.status === "in_progress",
  );
  if (
    candidate?.id === undefined ||
    candidate.phaseId === undefined ||
    candidate.admissibility?.state !== "not_admissible" ||
    candidate.admissibility.reason !== "phase_closed"
  ) {
    return null;
  }

  const gate = projectReport.roadmap.phaseGates.find(
    (item) => item.phaseId === candidate.phaseId && item.state === "closed",
  );
  if (!gate) return null;

  const fingerprint = gateFingerprint(gate);
  return Object.freeze({
    schemaVersion: 1 as const,
    type: "gate.blocked" as const,
    eventId: gateBlockedEventId(project.name, candidate.id, fingerprint),
    project: Object.freeze({ name: project.name }),
    candidate: Object.freeze({ id: candidate.id }),
    gate: Object.freeze({ fingerprint }),
  });
}

function currentFailureEvent(
  project: LoopApplicationConfig["projects"][number],
  projectReport: ReturnType<LoopApplicationAssembly["generateProjectReport"]>,
  overview: ReturnType<LoopApplicationAssembly["generateRoadmapOverviewReport"]>,
  executionStatus: Awaited<
    ReturnType<LoopApplicationAssembly["generateExecutionStatusReport"]>
  >,
) {
  const execution = executionStatus.execution;
  if (
    execution === null ||
    execution.state !== "failed" ||
    execution.candidateId === null ||
    execution.expectedGitHead === null
  ) {
    return null;
  }

  const currentCandidate = overview.roadmap.selectedCandidate;
  const currentGitHead = projectReport.git.lastCommit?.hash ?? null;
  if (
    currentCandidate?.id !== execution.candidateId ||
    currentGitHead === null ||
    currentGitHead.toLowerCase() !== execution.expectedGitHead.toLowerCase()
  ) {
    return null;
  }

  const terminal = execution.terminal;
  const failure = terminal?.failure ?? null;
  const failedCommand = terminal?.validation?.failedCommand ?? null;

  return Object.freeze({
    schemaVersion: 1 as const,
    type: "execution.failed" as const,
    eventId: failureEventId(project.name, execution.idempotencyKey),
    project: Object.freeze({ name: project.name }),
    candidate: Object.freeze({ id: execution.candidateId }),
    runId: execution.runId,
    occurredAt: execution.updatedAt,
    failure: Object.freeze({
      code: failure?.code ?? "execution_failed",
      message: failure?.message ?? "Execution failed.",
      failedCommand,
    }),
    executor:
      execution.executor === null
        ? null
        : Object.freeze({
            provider: execution.executor.provider,
            runtime: execution.executor.runtime,
            model: execution.executor.model,
            effort: execution.executor.effort,
            fundingMode: execution.executor.fundingMode,
            attempt: execution.executor.attempt,
            maxAttempts: execution.executor.maxAttempts,
          }),
  });
}

export async function generateCompletionEventsReport(
  application: LoopApplicationAssembly,
  config: LoopApplicationConfig,
  options: Readonly<{
    readCiEvent?: typeof readCiTerminalEvent;
  }> = {},
): Promise<CompletionEventsReport> {
  const events: unknown[] = [];
  const errors: {
    project: string;
    code: "overview_failed" | "execution_status_failed" | "ci_event_failed";
  }[] = [];

  for (const project of config.projects) {
    try {
      const ciEvent = currentCiTerminalEvent(
        project.name,
        options.readCiEvent ?? readCiTerminalEvent,
      );
      if (ciEvent) events.push(ciEvent);
    } catch {
      errors.push({ project: project.name, code: "ci_event_failed" });
    }

    let overview: ReturnType<
      LoopApplicationAssembly["generateRoadmapOverviewReport"]
    >;
    let projectReport: ReturnType<
      LoopApplicationAssembly["generateProjectReport"]
    > | null = null;
    try {
      overview = application.generateRoadmapOverviewReport(project);
      projectReport = application.generateProjectReport(project);
      const completionEvent = overview.roadmap.completionEvent;
      if (completionEvent) events.push(completionEvent);
      const gateBlockedEvent = currentGateBlockedEvent(project, projectReport);
      if (gateBlockedEvent) events.push(gateBlockedEvent);
    } catch {
      errors.push({ project: project.name, code: "overview_failed" });
      continue;
    }

    if (
      projectReport === null ||
      overview.roadmap.selectedCandidate?.id === undefined
    ) {
      continue;
    }

    try {
      const executionStatus =
        await application.generateExecutionStatusReport(project.name, {
          expectedDurationMs: null,
        });
      const failureEvent = currentFailureEvent(
        project,
        projectReport,
        overview,
        executionStatus,
      );
      if (failureEvent) events.push(failureEvent);
    } catch {
      errors.push({ project: project.name, code: "execution_status_failed" });
    }
  }

  return {
    schemaVersion: 1,
    events,
    errors,
  };
}

export async function printCompletionEventsJson(
  application: LoopApplicationAssembly,
  config: LoopApplicationConfig,
): Promise<void> {
  console.log(
    JSON.stringify(await generateCompletionEventsReport(application, config)),
  );
}
