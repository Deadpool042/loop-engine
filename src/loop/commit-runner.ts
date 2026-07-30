import { loadConfig } from "../core/config.js";
import { gitLoopCommitter, type LoopCommitter } from "./git-committer.js";
import { runLoopExecute, type LoopRunExecuteOptions } from "./execute-runner.js";
import type { LoopRunResult } from "./types.js";

export type LoopRunCommitOptions = LoopRunExecuteOptions &
  Readonly<{
    commitMessage: string;
    committer?: LoopCommitter;
  }>;

function failedCommitResult(
  execution: LoopRunResult,
  code: string,
  message: string,
): LoopRunResult {
  return Object.freeze({
    ...execution,
    mode: "commit" as const,
    status: "failed" as const,
    commit: null,
    publication: null,
    failure: Object.freeze({
      code,
      message,
      details: Object.freeze(["Git diagnostics are redacted."]),
    }),
  });
}

export async function runLoopCommit(
  projectName: string,
  options: LoopRunCommitOptions,
): Promise<LoopRunResult> {
  const execution = await runLoopExecute(projectName, options);
  if (
    execution.status !== "completed" ||
    execution.validation?.status !== "passed"
  ) {
    return Object.freeze({
      ...execution,
      mode: "commit" as const,
      publication: null,
    });
  }
  if (execution.modifiedFiles.length === 0) {
    return failedCommitResult(
      execution,
      "nothing_to_commit",
      "Validation passed but no provider modification was reported.",
    );
  }

  const config = (options.loadConfig ?? loadConfig)();
  const project = config.projects.find((candidate) => candidate.name === projectName);
  if (!project) {
    return failedCommitResult(
      execution,
      "unknown_project",
      "The project could not be resolved for controlled commit.",
    );
  }

  const result = await (options.committer ?? gitLoopCommitter)({
    project,
    modifiedFiles: execution.modifiedFiles,
    message: options.commitMessage,
  });
  if (!result.committed) {
    return failedCommitResult(execution, result.code, result.message);
  }

  return Object.freeze({
    ...execution,
    mode: "commit" as const,
    commit: Object.freeze({ sha: result.sha, message: result.message }),
    publication: null,
  });
}
