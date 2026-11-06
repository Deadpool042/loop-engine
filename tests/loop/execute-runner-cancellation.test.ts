import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runLoopExecute } from "../../src/loop/execute-runner.js";
import type {
  LoopExecutor,
  LoopRepairer,
  LoopValidator,
} from "../../src/loop/execution.js";
import { createRunnerFixture } from "./support/runner-fixture.js";

const completedExecution = async () => ({
  status: "completed" as const,
  modifiedFiles: [] as readonly string[],
  details: ["synthetic execution"],
});
const passingValidation: LoopValidator = async () => ({
  status: "passed",
  failedCommand: null,
  exitCode: 0,
  details: ["synthetic validation passed"],
});
const failingValidation: LoopValidator = async () => ({
  status: "failed",
  failedCommand: "fixture-validation",
  exitCode: 1,
  details: ["synthetic validation failed"],
});

async function run(
  extra: Record<string, unknown>,
  signal: AbortSignal | undefined,
) {
  const fixture = createRunnerFixture();
  const result = await runLoopExecute("cancellation-fixture", {
    ...fixture.options,
    ...(signal === undefined ? {} : { signal }),
    ...extra,
  });
  return { result, counters: fixture.counters };
}

describe("runLoopExecute — cooperative cancellation (L7)", () => {
  it("1. cancels before launch: no configuration, executor or validator is touched", async () => {
    const controller = new AbortController();
    controller.abort();
    let executorCalls = 0;
    let validatorCalls = 0;
    const { result, counters } = await run(
      {
        executor: (async () => {
          executorCalls += 1;
          return completedExecution();
        }) satisfies LoopExecutor,
        validator: (async (input) => {
          validatorCalls += 1;
          return passingValidation(input);
        }) satisfies LoopValidator,
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(result.failure?.code, "execution_cancelled");
    assert.equal(executorCalls, 0);
    assert.equal(validatorCalls, 0);
    assert.equal(counters.loadConfig, 0);
    assert.equal(counters.readModifiedWorktreeFiles, 0);
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
  });

  it("2. cancels during an asynchronous executor operation and hands it the signal", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    let validatorCalls = 0;
    const { result } = await run(
      {
        executor: ((_plan, _cwd, context) => {
          received = context?.signal;
          return new Promise((_resolve, reject) => {
            context?.signal?.addEventListener(
              "abort",
              () =>
                reject(new Error("executor-aborted /private/path secret-xyz")),
              { once: true },
            );
            setImmediate(() => controller.abort());
          });
        }) satisfies LoopExecutor,
        validator: (async (input) => {
          validatorCalls += 1;
          return passingValidation(input);
        }) satisfies LoopValidator,
      },
      controller.signal,
    );

    assert.equal(received, controller.signal);
    assert.equal(result.status, "cancelled");
    assert.equal(result.failure?.code, "execution_cancelled");
    assert.notEqual(result.failure?.code, "executor_failed");
    assert.equal(validatorCalls, 0);
    assert.doesNotMatch(JSON.stringify(result), /secret-xyz|private\/path/);
  });

  it("3. cancels between two steps: validation never starts after the executor returns", async () => {
    const controller = new AbortController();
    let validatorCalls = 0;
    const { result } = await run(
      {
        executor: (async () => {
          controller.abort();
          return {
            status: "completed" as const,
            modifiedFiles: ["src/a.ts"],
            details: [],
          };
        }) satisfies LoopExecutor,
        validator: (async (input) => {
          validatorCalls += 1;
          return passingValidation(input);
        }) satisfies LoopValidator,
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(validatorCalls, 0);
    assert.deepEqual(result.modifiedFiles, ["src/a.ts"]);
  });

  it("4a. cancels during a repair (injected repairer): no revalidation, no further repair", async () => {
    const controller = new AbortController();
    let validatorCalls = 0;
    let repairerCalls = 0;
    const { result } = await run(
      {
        maxRepairs: 3,
        executor: completedExecution,
        validator: (async (input) => {
          validatorCalls += 1;
          return failingValidation(input);
        }) satisfies LoopValidator,
        repairer: (async (input) => {
          repairerCalls += 1;
          assert.equal(input.signal, controller.signal);
          controller.abort();
          return {
            status: "completed" as const,
            modifiedFiles: ["src/repaired.ts"],
            details: [],
          };
        }) satisfies LoopRepairer,
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(repairerCalls, 1);
    assert.equal(validatorCalls, 1);
    assert.deepEqual(result.modifiedFiles, ["src/repaired.ts"]);
  });

  it("4b. cancels during an executor-driven repair: the executor is not called again", async () => {
    const controller = new AbortController();
    let executorCalls = 0;
    let validatorCalls = 0;
    const { result } = await run(
      {
        maxRepairs: 3,
        executor: (async () => {
          executorCalls += 1;
          if (executorCalls === 2) controller.abort();
          return {
            status: "completed" as const,
            modifiedFiles: [] as readonly string[],
            details: [],
          };
        }) satisfies LoopExecutor,
        validator: (async (input) => {
          validatorCalls += 1;
          return failingValidation(input);
        }) satisfies LoopValidator,
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(executorCalls, 2);
    assert.equal(validatorCalls, 1);
  });

  it("4c. a cancellation observed on a failing validation starts no repair", async () => {
    const controller = new AbortController();
    let repairerCalls = 0;
    const { result } = await run(
      {
        maxRepairs: 3,
        executor: completedExecution,
        validator: (async (input) => {
          controller.abort();
          return failingValidation(input);
        }) satisfies LoopValidator,
        repairer: (async () => {
          repairerCalls += 1;
          return {
            status: "completed" as const,
            modifiedFiles: [],
            details: [],
          };
        }) satisfies LoopRepairer,
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(repairerCalls, 0);
  });

  it("5. cancellation racing a normal end is never reported as success", async () => {
    const controller = new AbortController();
    const { result } = await run(
      {
        executor: completedExecution,
        validator: (async (input) => {
          const passed = await passingValidation(input);
          controller.abort();
          return passed;
        }) satisfies LoopValidator,
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.notEqual(result.status, "completed");
    assert.equal(result.failure?.code, "execution_cancelled");
  });

  it("6a. cancellation arriving with an execution error is cancelled, not executor_failed", async () => {
    const controller = new AbortController();
    const { result } = await run(
      {
        executor: (async () => {
          controller.abort();
          throw new Error("provider exploded");
        }) satisfies LoopExecutor,
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(result.failure?.code, "execution_cancelled");
  });

  it("6b. without cancellation an execution error is still executor_failed", async () => {
    const controller = new AbortController();
    const { result } = await run(
      {
        executor: (async () => {
          throw new Error("provider exploded");
        }) satisfies LoopExecutor,
      },
      controller.signal,
    );

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "executor_failed");
  });

  it("6c. a validator error under cancellation is cancelled, not validation_error", async () => {
    const controller = new AbortController();
    const { result } = await run(
      {
        executor: completedExecution,
        validator: (async () => {
          controller.abort();
          throw new Error("validator exploded");
        }) satisfies LoopValidator,
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(result.failure?.code, "execution_cancelled");
  });

  it("7. repeated cancellation is idempotent, keeps the first cause and is deterministic", async () => {
    const { abortWithReason } = await import("../../src/loop/cancellation.js");
    const outcomes: string[] = [];
    for (let round = 0; round < 2; round += 1) {
      const controller = new AbortController();
      const { result } = await run(
        {
          executor: (async () => {
            abortWithReason(controller, "lease_lost");
            abortWithReason(controller, "cancellation_requested");
            controller.abort(new Error("raw late reason"));
            return {
              status: "completed" as const,
              modifiedFiles: [],
              details: [],
            };
          }) satisfies LoopExecutor,
        },
        controller.signal,
      );
      assert.equal(result.status, "cancelled");
      assert.match(result.failure?.details.join("\n") ?? "", /lease_lost/);
      assert.doesNotMatch(JSON.stringify(result), /raw late reason/);
      outcomes.push(
        JSON.stringify({ ...result, startedAt: "", completedAt: "" }),
      );
    }
    assert.equal(outcomes[0], outcomes[1]);
  });

  it("7b. an untyped abort reason is redacted to a closed cause", async () => {
    const controller = new AbortController();
    const { result } = await run(
      {
        executor: (async () => {
          controller.abort(new Error("token=abc123 /Users/someone"));
          return completedExecution();
        }) satisfies LoopExecutor,
      },
      controller.signal,
    );
    assert.equal(result.status, "cancelled");
    assert.match(result.failure?.details.join("\n") ?? "", /caller_aborted/);
    assert.doesNotMatch(JSON.stringify(result), /abc123|someone/);
  });

  it("9. an executor that ignores the signal cannot turn a cancelled run into a success", async () => {
    const controller = new AbortController();
    let validatorCalls = 0;
    const { result } = await run(
      {
        executor: (async () => {
          controller.abort();
          await new Promise((resolve) => setTimeout(resolve, 5));
          return {
            status: "completed" as const,
            modifiedFiles: ["src/ignored.ts"],
            details: ["done as if nothing happened"],
          };
        }) satisfies LoopExecutor,
        validator: (async (input) => {
          validatorCalls += 1;
          return passingValidation(input);
        }) satisfies LoopValidator,
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(validatorCalls, 0);
    assert.equal(result.validation, null);
  });

  it("11. an external write already committed is reported, not claimed to be rolled back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "le-cancel-"));
    try {
      const target = join(dir, "committed.txt");
      const controller = new AbortController();
      const { result } = await run(
        {
          executor: (async () => {
            await writeFile(target, "irreversible", "utf8");
            controller.abort();
            return {
              status: "completed" as const,
              modifiedFiles: ["committed.txt"],
              details: [],
            };
          }) satisfies LoopExecutor,
        },
        controller.signal,
      );

      assert.equal(result.status, "cancelled");
      assert.deepEqual(result.modifiedFiles, ["committed.txt"]);
      assert.equal(await readFile(target, "utf8"), "irreversible");
      assert.match(
        result.failure?.details.join("\n") ?? "",
        /does not stop or roll back external effects/i,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("12. no new operation starts once the cancellation has been observed", async () => {
    const controller = new AbortController();
    let executorCalls = 0;
    let validatorCalls = 0;
    let repairerCalls = 0;
    let atAbort = { plan: 0, worktree: 0 };
    const fixture = createRunnerFixture();
    const result = await runLoopExecute("cancellation-fixture", {
      ...fixture.options,
      signal: controller.signal,
      maxRepairs: 3,
      executor: (async () => {
        executorCalls += 1;
        atAbort = {
          plan: fixture.counters.planLoopCycle,
          worktree: fixture.counters.readModifiedWorktreeFiles,
        };
        controller.abort();
        return completedExecution();
      }) satisfies LoopExecutor,
      validator: (async (input) => {
        validatorCalls += 1;
        return failingValidation(input);
      }) satisfies LoopValidator,
      repairer: (async () => {
        repairerCalls += 1;
        return { status: "completed" as const, modifiedFiles: [], details: [] };
      }) satisfies LoopRepairer,
    });

    assert.equal(result.status, "cancelled");
    assert.equal(executorCalls, 1);
    assert.equal(validatorCalls, 0);
    assert.equal(repairerCalls, 0);
    assert.equal(fixture.counters.planLoopCycle, atAbort.plan);
    assert.equal(fixture.counters.readModifiedWorktreeFiles, atAbort.worktree);
  });

  it("hands the signal to the validator", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    await run(
      {
        executor: completedExecution,
        validator: (async (input) => {
          received = input.signal;
          return passingValidation(input);
        }) satisfies LoopValidator,
      },
      controller.signal,
    );
    assert.equal(received, controller.signal);
  });

  it("is unchanged without a signal", async () => {
    const { result } = await run(
      { executor: completedExecution, validator: passingValidation },
      undefined,
    );
    assert.equal(result.status, "completed");
    assert.equal(result.failure, null);
  });

  it("surfaces a cleanup failure instead of hiding it behind the cancellation", async () => {
    const controller = new AbortController();
    const { result } = await run(
      {
        executor: (async () => {
          controller.abort();
          return {
            status: "failed" as const,
            modifiedFiles: [] as readonly string[],
            failure: {
              code: "cancellation_cleanup_failed",
              message: "A provider process survived the cancellation.",
              details: ["process group still alive"],
            },
          };
        }) satisfies LoopExecutor,
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(result.failure?.code, "cancellation_cleanup_failed");
  });

  it("surfaces a validation process group that could not be terminated", async () => {
    const controller = new AbortController();
    const { result } = await run(
      {
        executor: completedExecution,
        validator: (async () => {
          controller.abort();
          return {
            status: "failed" as const,
            failedCommand: "fixture-validation",
            exitCode: 1,
            details: ["synthetic validation failed"],
            cancellationCleanupFailed: true as const,
          };
        }) satisfies LoopValidator,
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(result.failure?.code, "cancellation_cleanup_failed");
  });

  it("a worktree inventory failing under cancellation is cancelled, not worktree_status_failed", async () => {
    const controller = new AbortController();
    const { result } = await run(
      {
        executor: completedExecution,
        readModifiedWorktreeFiles: async () => {
          controller.abort();
          return null;
        },
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(result.failure?.code, "execution_cancelled");
  });

  it("a worktree inventory is not started once the cancellation was observed", async () => {
    const controller = new AbortController();
    let inventories = 0;
    const { result } = await run(
      {
        executor: (async () => {
          controller.abort();
          return completedExecution();
        }) satisfies LoopExecutor,
        readModifiedWorktreeFiles: async () => {
          inventories += 1;
          return [] as readonly string[];
        },
      },
      controller.signal,
    );

    assert.equal(result.status, "cancelled");
    assert.equal(inventories, 0);
  });
});
