import { gitLoopCommitter, type LoopCommitter } from "./git-committer.js";
import { runLoopExecute, type LoopRunExecuteOptions } from "./execute-runner.js";
import type { LoopRunResult } from "./types.js";

export type LoopRunCommitOptions = LoopRunExecuteOptions &
  Readonly<{
    commitMessage: string;
    committer?: LoopCommitter;
  }>;

export async function runLoopCommit(
  projectName: string,
  options: LoopRunCommitOptions,
): Promise<LoopRunResult> {
  const execution = await runLoopExecute(projectName, options);
  if (
    execution.status !== "completed" ||
    execution.validation?.status !== "passed" ||
    execution.modifiedFiles.length === 0
  ) {
    return Object.freeze({ ...execution, mode: "commit" as const });
  }

  const config = (options.loadConfig ?? (() => {
    throw new Error("loadConfig dependency unavailable after execution");
  }))();
  const project = config.projects.find((candidate) => candidate.name === projectName);
  if (!project) return Object.freeze({ ...execution, mode: "commit" as const });

  const result = await (options.committer ?? gitLoopCommitter)({
    project,
    modifiedFiles: execution.modifiedFiles,
    message: options.commitMessage,
  });
  if (!result.committed) {
    return Object.freeze({
      ...execution,
      mode: "commit" as const,
      status: "failed" as const,
      commit: null,
      failure: Object.freeze({
        code: result.code,
        message: result.message,
        details: Object.freeze(["Git diagnostics are redacted."]),
      }),
    });
  }

  return Object.freeze({
    ...execution,
    mode: "commit" as const,
    commit: Object.freeze({ sha: result.sha, message: result.message }),
  });
}
