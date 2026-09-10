import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../composition/index.js";

export type RecordCiTerminalEventInput = Readonly<{
  conclusion: "success" | "failure" | "cancelled";
  sha: string;
  workflow: string;
  runId: string;
  runAttempt: number;
  prNumber?: number | null;
  branch?: string | null;
}>;

export type RecordCiTerminalEventReport = Readonly<{
  schemaVersion: 1;
  status: "recorded";
  project: string;
  repository: string;
  conclusion: "success" | "failure" | "cancelled";
  sha: string;
  workflow: string;
  runId: string;
  runAttempt: number;
  prNumber: number | null;
  branch: string | null;
}>;

export function recordCiTerminalEventCommand(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
  input: RecordCiTerminalEventInput,
  now: () => Date = () => new Date(),
): RecordCiTerminalEventReport {
  const repository = project.repository?.trim();
  if (!repository) {
    throw new Error("project_repository_required");
  }

  const prNumber = input.prNumber ?? null;
  const branch = input.branch?.trim() || null;
  const runUrl = `https://github.com/${repository}/actions/runs/${input.runId}`;

  application.recordCiTerminalEvent({
    schemaVersion: 1,
    project: project.name,
    repository,
    sha: input.sha,
    conclusion: input.conclusion,
    workflow: input.workflow,
    runId: input.runId,
    runAttempt: input.runAttempt,
    runUrl,
    prNumber,
    branch,
    occurredAt: now().toISOString(),
  });

  return Object.freeze({
    schemaVersion: 1,
    status: "recorded" as const,
    project: project.name,
    repository,
    conclusion: input.conclusion,
    sha: input.sha,
    workflow: input.workflow,
    runId: input.runId,
    runAttempt: input.runAttempt,
    prNumber,
    branch,
  });
}
