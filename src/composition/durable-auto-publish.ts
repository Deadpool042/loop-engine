import { resolve } from "node:path";

import type { AgentRegistry } from "../agents/registry.js";
import { resolveLoopEngineStatePath } from "../core/runtime-state.js";
import type { LoopRunHistoryWriteOutcome } from "../core/run-history.js";
import { createFileDurableExecutionStore } from "../loop/file-durable-execution-store.js";
import type { LoopExecutor } from "../loop/execution.js";
import { createDurableExecutionControlPlane } from "./durable-execution-control-plane.js";
import type { IsolatedProviderRunPublish } from "./isolated-provider-publication.js";

const DURABLE_EXECUTION_DIRECTORY =
  resolveLoopEngineStatePath("durable-executions");
const DURABLE_LEASE_DURATION_MS = 30 * 60_000;

export type DurablePublishApplication = Readonly<{
  loopAgentRegistry?: AgentRegistry;
  loopExecutor?: LoopExecutor;
  recordLoopRunHistory: (result: Awaited<ReturnType<IsolatedProviderRunPublish>>) => LoopRunHistoryWriteOutcome;
  runLoopPublish: IsolatedProviderRunPublish;
}>;

export type DurableAutoPublishReport = Readonly<{
  schemaVersion: 1;
  mode: "publish";
  durable: true;
  project: string;
  candidate: Readonly<{ id: string }>;
  expectedGitHead: string;
  idempotencyKey: string;
  status:
    | "completed"
    | "failed"
    | "cancelled"
    | "in_progress"
    | "replayed"
    | "rejected";
  runId: string | null;
  publication: Readonly<{
    ref: string;
    commitSha: string;
  }> | null;
  fingerprint: Readonly<{ algorithm: "sha256"; digest: string }> | null;
  historyRecorded: boolean | null;
  rejectionCode?: string;
}>;

export type DurableAutoPublishResult = Readonly<{
  exitCode: number;
  report: DurableAutoPublishReport;
}>;

export function durableAutoSubscriptionKey(
  project: string,
  candidateId: string,
  expectedGitHead: string,
): string {
  return `auto-subscription:${project}:${candidateId}:${expectedGitHead.toLowerCase()}`;
}

export type DurableAutoPublishInput = Readonly<{
  project: string;
  candidateId: string;
  expectedGitHead: string;
  maxRepairs: number;
  storeDirectory?: string;
  owner?: string;
}>;

export async function runDurableAutoSubscriptionPublish(
  application: DurablePublishApplication,
  input: DurableAutoPublishInput,
): Promise<DurableAutoPublishResult> {
  const idempotencyKey = durableAutoSubscriptionKey(
    input.project,
    input.candidateId,
    input.expectedGitHead,
  );
  const store = createFileDurableExecutionStore({
    directory: resolve(
      input.storeDirectory ?? DURABLE_EXECUTION_DIRECTORY,
    ),
  });
  const control = createDurableExecutionControlPlane(store, {
    runLoopExecute: (projectName, options) =>
      application.runLoopPublish(projectName, options),
  });

  const executionOptions = {
    candidateId: input.candidateId,
    maxRepairs: input.maxRepairs,
    ...(application.loopExecutor === undefined
      ? {}
      : { executor: application.loopExecutor }),
    ...(application.loopAgentRegistry === undefined
      ? {}
      : { agentRegistry: application.loopAgentRegistry }),
  };

  const response = await control.execute(
    {
      idempotencyKey,
      project: input.project,
      owner: input.owner ?? `loop-engine-cli:${process.pid}`,
      leaseDurationMs: DURABLE_LEASE_DURATION_MS,
    },
    executionOptions,
  );

  if (response.outcome.status === "rejected") {
    const inProgress = response.outcome.code === "execution_in_progress";
    return Object.freeze({
      exitCode: inProgress ? 0 : 1,
      report: Object.freeze({
        schemaVersion: 1 as const,
        mode: "publish" as const,
        durable: true as const,
        project: input.project,
        candidate: Object.freeze({ id: input.candidateId }),
        expectedGitHead: input.expectedGitHead.toLowerCase(),
        idempotencyKey,
        status: inProgress ? ("in_progress" as const) : ("rejected" as const),
        runId: response.outcome.record?.result?.runId ?? null,
        publication:
          response.outcome.record?.result?.publication === null ||
          response.outcome.record?.result?.publication === undefined
            ? null
            : Object.freeze({
                ref: response.outcome.record.result.publication.ref,
                commitSha:
                  response.outcome.record.result.publication.commitSha,
              }),
        fingerprint: response.fingerprint,
        historyRecorded: null,
        rejectionCode: response.outcome.code,
      }),
    });
  }

  const record = response.outcome.record;
  const result = record.result;
  let historyRecorded: boolean | null = null;
  if (response.outcome.status === "executed" && result !== null) {
    historyRecorded = application.recordLoopRunHistory(result).ok;
  }

  const replayed = response.outcome.status === "replayed";
  const status =
    replayed && record.status === "completed"
      ? ("replayed" as const)
      : record.status === "running"
        ? ("in_progress" as const)
        : record.status;

  return Object.freeze({
    exitCode:
      record.status === "completed" || record.status === "running" ? 0 : 1,
    report: Object.freeze({
      schemaVersion: 1 as const,
      mode: "publish" as const,
      durable: true as const,
      project: input.project,
      candidate: Object.freeze({ id: input.candidateId }),
      expectedGitHead: input.expectedGitHead.toLowerCase(),
      idempotencyKey,
      status,
      runId: result?.runId ?? null,
      publication:
        result?.publication === null || result?.publication === undefined
          ? null
          : Object.freeze({
              ref: result.publication.ref,
              commitSha: result.publication.commitSha,
            }),
      fingerprint: response.fingerprint,
      historyRecorded,
    }),
  });
}
