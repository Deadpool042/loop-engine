import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createGitWorktreeWorkspaceManager,
  createIsolatedWorkerPlatform,
  createLocalProjectLockManager,
} from "../execution/index.js";
import type { LoopRunExecuteOptions } from "../loop/execute-runner.js";
import type { LoopExecutor } from "../loop/execution.js";
import { runLoopExecuteWithProviderFailoverEvidence } from "../loop/provider-failover-runner.js";
import type { LoopRunResult } from "../loop/types.js";
import type { AgentRegistry } from "../agents/registry.js";

const DEFAULT_ROOT = join(tmpdir(), "loop-engine-isolated-provider-execution");

export type IsolatedProviderExecutionOptions = Readonly<{
  executor: LoopExecutor;
  agentRegistry: AgentRegistry;
  resolveRepositoryPath: (projectId: string) => string;
  lockRoot?: string;
  workspaceRoot?: string;
  createAttemptId?: () => string;
  runLoopExecute?: typeof runLoopExecuteWithProviderFailoverEvidence;
}>;

function isolatedFailure(
  project: string,
  runId: string,
  now: () => string,
  code: string,
  message: string,
): LoopRunResult {
  const timestamp = now();
  return Object.freeze({
    schemaVersion: 1,
    runId,
    project,
    mode: "execute",
    status: "failed",
    startedAt: timestamp,
    completedAt: timestamp,
    candidate: null,
    steps: Object.freeze([]),
    validation: null,
    modifiedFiles: Object.freeze([]),
    commit: null,
    publication: null,
    failure: Object.freeze({
      code,
      message,
      details: Object.freeze(["Isolated execution diagnostics are redacted."]),
    }),
    agentPolicy: null,
    contextPackage: null,
    executionPlanEvidence: null,
    executionPlanFingerprint: null,
    providerFailoverEvidence: null,
    providerFailoverFingerprint: null,
  });
}

/**
 * Composition-only wrapper for execute mode. It reuses the existing local lock,
 * Git worktree manager and isolated worker platform while leaving LoopRunner,
 * providers and controlled commit semantics unchanged.
 */
export function createIsolatedProviderRunExecute(
  options: IsolatedProviderExecutionOptions,
): typeof runLoopExecuteWithProviderFailoverEvidence {
  const lockRoot = options.lockRoot ?? join(DEFAULT_ROOT, "locks");
  const workspaceRoot =
    options.workspaceRoot ?? join(DEFAULT_ROOT, "workspaces");
  const platform = createIsolatedWorkerPlatform(
    createLocalProjectLockManager({ lockRoot }),
    createGitWorktreeWorkspaceManager({
      workspaceRoot,
      resolveRepositoryPath: options.resolveRepositoryPath,
    }),
  );
  const createAttemptId = options.createAttemptId ?? randomUUID;
  const execute =
    options.runLoopExecute ?? runLoopExecuteWithProviderFailoverEvidence;

  return async (projectName, runOptions: LoopRunExecuteOptions = {}) => {
    const attemptId = createAttemptId();
    const now = runOptions.now ?? (() => new Date().toISOString());
    const executor = runOptions.executor ?? options.executor;

    try {
      const outcome = await platform.execute(
        Object.freeze({ projectId: projectName, attemptId }),
        async (workspace) =>
          execute(projectName, {
            ...runOptions,
            executor,
            agentRegistry: runOptions.agentRegistry ?? options.agentRegistry,
            executionProjectPath: workspace.path,
          }),
      );

      return outcome.status === "completed"
        ? outcome.result
        : isolatedFailure(
            projectName,
            attemptId,
            now,
            "project_locked",
            "Another isolated execution already holds this project lock.",
          );
    } catch {
      return isolatedFailure(
        projectName,
        attemptId,
        now,
        "isolated_execution_failed",
        "Unable to prepare or run the isolated execution.",
      );
    }
  };
}
