import { createHash } from "node:crypto";

import type {
  LoopApplicationAssembly,
  LoopApplicationConfig,
} from "../composition/index.js";

export type CompletionEventsReport = Readonly<{
  schemaVersion: 1;
  events: readonly unknown[];
  errors: readonly Readonly<{
    project: string;
    code: "overview_failed" | "execution_status_failed";
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

function currentFailureEvent(
  application: LoopApplicationAssembly,
  project: LoopApplicationConfig["projects"][number],
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
  const currentGitHead =
    application.generateProjectReport(project).git.lastCommit?.hash ?? null;
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
): Promise<CompletionEventsReport> {
  const events: unknown[] = [];
  const errors: {
    project: string;
    code: "overview_failed" | "execution_status_failed";
  }[] = [];

  for (const project of config.projects) {
    let overview: ReturnType<
      LoopApplicationAssembly["generateRoadmapOverviewReport"]
    >;
    try {
      overview = application.generateRoadmapOverviewReport(project);
      const completionEvent = overview.roadmap.completionEvent;
      if (completionEvent) events.push(completionEvent);
    } catch {
      errors.push({ project: project.name, code: "overview_failed" });
      continue;
    }

    if (overview.roadmap.selectedCandidate?.id === undefined) continue;

    try {
      const executionStatus =
        await application.generateExecutionStatusReport(project.name, {
          expectedDurationMs: null,
        });
      const failureEvent = currentFailureEvent(
        application,
        project,
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
