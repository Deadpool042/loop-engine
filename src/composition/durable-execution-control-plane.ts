import type { LoopRunExecuteOptions } from "../loop/execute-runner.js";
import {
  requestDurableExecutionCancellation,
  runDurableLoopExecution,
} from "../loop/durable-execution-controller.js";
import type {
  DurableExecutionCancellationResult,
  DurableExecutionRequest,
  DurableExecutionResult,
  DurableExecutionStore,
} from "../loop/durable-execution.js";
import { fingerprintDurableExecutionRecord } from "../loop/durable-execution-integrity.js";
import { runLoopExecuteWithProviderFailoverEvidence } from "../loop/provider-failover-runner.js";

export type DurableExecutionControlPlane = Readonly<{
  execute(
    request: DurableExecutionRequest,
    options?: LoopRunExecuteOptions,
  ): Promise<Readonly<{
    outcome: DurableExecutionResult;
    fingerprint: ReturnType<typeof fingerprintDurableExecutionRecord> | null;
  }>>;
  cancel(
    idempotencyKey: string,
    requestedBy: string,
  ): Promise<DurableExecutionCancellationResult>;
}>;

export function createDurableExecutionControlPlane(
  store: DurableExecutionStore,
  dependencies: Readonly<{
    runLoopExecute?: typeof runLoopExecuteWithProviderFailoverEvidence;
    now?: () => string;
  }> = {},
): DurableExecutionControlPlane {
  const runLoopExecute =
    dependencies.runLoopExecute ?? runLoopExecuteWithProviderFailoverEvidence;
  const now = dependencies.now ?? (() => new Date().toISOString());

  return Object.freeze({
    async execute(request, options = {}) {
      const outcome = await runDurableLoopExecution(
        store,
        request,
        () => runLoopExecute(request.project, options),
        now,
      );
      return Object.freeze({
        outcome,
        fingerprint:
          outcome.status === "rejected"
            ? null
            : fingerprintDurableExecutionRecord(outcome.record),
      });
    },
    cancel(idempotencyKey, requestedBy) {
      return requestDurableExecutionCancellation(
        store,
        idempotencyKey,
        requestedBy,
        now,
      );
    },
  });
}
