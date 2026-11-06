import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createDurableExecutionControlPlane } from "../../src/composition/durable-execution-control-plane.js";
import {
  requestDurableExecutionCancellation,
  runDurableLoopExecution,
} from "../../src/loop/durable-execution-controller.js";
import type {
  DurableExecutionProgress,
  DurableExecutionRecord,
} from "../../src/loop/durable-execution.js";
import { createInMemoryDurableExecutionStore } from "../../src/loop/in-memory-durable-execution-store.js";
import type { LoopRunResult } from "../../src/loop/types.js";
import { completedResult } from "./support/synthetic.js";

const KEY = "idem-l7-cancellation";
const request = Object.freeze({
  idempotencyKey: KEY,
  project: "synthetic",
  owner: "worker-a",
  leaseDurationMs: 600_000,
});

function progress(step: string): DurableExecutionProgress {
  return Object.freeze({
    status: "executing" as const,
    at: new Date().toISOString(),
    runId: "run-synthetic",
    step,
    executor: null,
  });
}

function cancelledResult(code = "execution_cancelled"): LoopRunResult {
  return Object.freeze({
    ...completedResult(),
    status: "cancelled" as const,
    failure: Object.freeze({
      code,
      message: "Execution was cancelled before completion.",
      details: Object.freeze(["Cancellation cause: lease_lost"]),
    }),
  }) as LoopRunResult;
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("runDurableLoopExecution — abort propagation (L7)", () => {
  it("hands a live, unaborted signal to the execute callback", async () => {
    const store = createInMemoryDurableExecutionStore();
    let observed: AbortSignal | undefined;
    const outcome = await runDurableLoopExecution(
      store,
      request,
      async (_onProgress, context) => {
        observed = context?.signal;
        assert.equal(context?.signal.aborted, false);
        return completedResult();
      },
    );
    assert.equal(outcome.status, "executed");
    assert.equal(
      outcome.status === "executed" ? outcome.record.status : null,
      "completed",
    );
    assert.ok(observed instanceof AbortSignal);
  });

  it("requestAbort aborts with a typed reason and is idempotent", async () => {
    const store = createInMemoryDurableExecutionStore();
    await runDurableLoopExecution(
      store,
      request,
      async (_onProgress, context) => {
        assert.ok(context);
        context.requestAbort("lease_lost");
        context.requestAbort("cancellation_requested");
        assert.equal(context.signal.aborted, true);
        const { cancellationReasonOf } =
          await import("../../src/loop/cancellation.js");
        assert.equal(cancellationReasonOf(context.signal), "lease_lost");
        return cancelledResult();
      },
    );
  });

  it("8. a lease lost during the run aborts the executor signal and the old holder writes no terminal state", async () => {
    const store = createInMemoryDurableExecutionStore();
    let successor: DurableExecutionRecord | null = null;
    let abortedAfterProgress = false;
    let reason: string | null = null;

    const outcome = await runDurableLoopExecution(
      store,
      request,
      async (onProgress, context) => {
        assert.ok(context);
        const mine = await store.load(KEY);
        assert.ok(mine);
        // Another worker takes over: attempt and owner change under our feet.
        successor = Object.freeze({
          ...mine,
          revision: mine.revision + 1,
          attempt: mine.attempt + 1,
          leaseOwner: "worker-b",
        });
        assert.equal(await store.save(successor, mine.revision), true);

        onProgress(progress("executing"));
        await settle();
        abortedAfterProgress = context.signal.aborted;
        const { cancellationReasonOf } =
          await import("../../src/loop/cancellation.js");
        reason = context.signal.aborted
          ? cancellationReasonOf(context.signal)
          : null;
        return cancelledResult();
      },
    );

    assert.equal(abortedAfterProgress, true);
    assert.equal(reason, "lease_lost");
    assert.equal(outcome.status, "rejected");
    // The successor's record is untouched: no terminal state from the old holder.
    const after = await store.load(KEY);
    assert.deepEqual(after, successor);
    assert.equal(after?.status, "running");
    assert.equal(after?.leaseOwner, "worker-b");
  });

  it("a cancellation requested during the run aborts the signal at the next progress observation", async () => {
    const store = createInMemoryDurableExecutionStore();
    let reason: string | null = null;
    const outcome = await runDurableLoopExecution(
      store,
      request,
      async (onProgress, context) => {
        assert.ok(context);
        const requested = await requestDurableExecutionCancellation(
          store,
          KEY,
          "operator",
        );
        assert.equal(requested.status, "requested");
        onProgress(progress("executing"));
        await settle();
        const { cancellationReasonOf } =
          await import("../../src/loop/cancellation.js");
        reason = context.signal.aborted
          ? cancellationReasonOf(context.signal)
          : null;
        return cancelledResult();
      },
    );

    assert.equal(reason, "cancellation_requested");
    assert.equal(outcome.status, "executed");
    assert.equal(
      outcome.status === "executed" ? outcome.record.status : null,
      "cancelled",
    );
  });

  it("a cancelled run result is persisted as cancelled, never as completed or plain failed", async () => {
    const store = createInMemoryDurableExecutionStore();
    const outcome = await runDurableLoopExecution(store, request, async () =>
      cancelledResult(),
    );
    assert.equal(outcome.status, "executed");
    const record = outcome.status === "executed" ? outcome.record : null;
    assert.equal(record?.status, "cancelled");
    assert.equal(record?.failure?.code, "execution_cancelled");
    assert.equal(record?.result?.status, "cancelled");
    assert.equal(record?.leaseOwner, null);
  });

  it("the control plane forwards the durable signal and the caller's signal to the runner", async () => {
    const store = createInMemoryDurableExecutionStore();
    const caller = new AbortController();
    let forwarded: AbortSignal | undefined;
    const plane = createDurableExecutionControlPlane(store, {
      runLoopExecute: async (_project, options) => {
        forwarded = options?.signal;
        assert.equal(forwarded?.aborted, false);
        caller.abort();
        assert.equal(forwarded?.aborted, true, "caller abort must propagate");
        return cancelledResult();
      },
    });
    const outcome = await plane.execute(request, { signal: caller.signal });
    assert.ok(forwarded instanceof AbortSignal);
    assert.equal(
      outcome.outcome.status === "executed"
        ? outcome.outcome.record.status
        : null,
      "cancelled",
    );
  });
});
