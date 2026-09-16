import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  durableAutoSubscriptionKey,
  runDurableAutoSubscriptionPublish,
} from "../../src/composition/durable-auto-publish.js";
import { readFileDurableExecutionRecords } from "../../src/loop/file-durable-execution-store.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function completedResult(runId = "run-1"): LoopRunResult {
  return Object.freeze({
    schemaVersion: 1 as const,
    runId,
    project: "example",
    mode: "publish" as const,
    status: "completed" as const,
    startedAt: "2026-09-06T09:00:00.000Z",
    completedAt: "2026-09-06T09:01:00.000Z",
    candidate: null,
    steps: Object.freeze([]),
    validation: Object.freeze({
      status: "passed" as const,
      attempts: 1,
      repairAttempts: 0,
      commands: Object.freeze(["pnpm run validate"]),
      failedCommand: null,
      exitCode: 0,
    }),
    modifiedFiles: Object.freeze(["docs/proof.md"]),
    commit: null,
    publication: Object.freeze({
      kind: "candidate_ref" as const,
      ref: "refs/loop-engine/candidates/example/run-1",
      commitSha: "b".repeat(40),
      baseSha: "a".repeat(40),
    }),
    failure: null,
    agentPolicy: null,
    contextPackage: null,
  });
}

function failedResult(runId = "run-failed"): LoopRunResult {
  return Object.freeze({
    ...completedResult(runId),
    status: "failed" as const,
    validation: Object.freeze({
      status: "failed" as const,
      attempts: 1,
      repairAttempts: 0,
      commands: Object.freeze(["pnpm run typecheck"]),
      failedCommand: "pnpm run typecheck",
      exitCode: 2,
    }),
    publication: null,
    failure: Object.freeze({
      code: "validation_failed",
      message: "Validation failed.",
      details: Object.freeze(["Failed command: pnpm run typecheck"]),
    }),
  });
}

test("durable AUTO publish replays the same terminal result without a second execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-durable-auto-publish-"));
  try {
    let publishCalls = 0;
    let historyCalls = 0;
    let observedMaxModelAttempts: number | null = null;
    let observedPreferredRuntimes: readonly string[] | null = null;
    const application = {
      async runLoopPublish(
        _projectName: string,
        options: {
          maxModelAttempts?: number;
          agentPolicy?: { preferredRuntimes?: readonly string[] };
        },
      ) {
        publishCalls += 1;
        observedMaxModelAttempts = options.maxModelAttempts ?? null;
        observedPreferredRuntimes = options.agentPolicy?.preferredRuntimes ?? null;
        return completedResult();
      },
      recordLoopRunHistory() {
        historyCalls += 1;
        return Object.freeze({ written: true, ok: true });
      },
    };

    const input = {
      project: "example",
      candidateId: "H1-L1",
      expectedGitHead: "a".repeat(40),
      maxRepairs: 0,
      storeDirectory: root,
      owner: "worker:first",
    } as const;

    const first = await runDurableAutoSubscriptionPublish(application, input);
    const second = await runDurableAutoSubscriptionPublish(application, {
      ...input,
      owner: "worker:retry",
    });

    assert.equal(first.exitCode, 0);
    assert.equal(first.report.status, "completed");
    assert.equal(second.exitCode, 0);
    assert.equal(second.report.status, "replayed");
    assert.equal(second.report.runId, "run-1");
    assert.equal(publishCalls, 1);
    assert.equal(historyCalls, 1);
    assert.equal(observedMaxModelAttempts, 2);
    assert.deepEqual(observedPreferredRuntimes, [
      "openclaw",
      "codex",
      "claude_code",
    ]);
    assert.equal(
      first.report.idempotencyKey,
      durableAutoSubscriptionKey(
        "example",
        "H1-L1",
        "a".repeat(40),
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("durable AUTO publish persists its running record before preparation starts", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-durable-auto-publish-"));
  try {
    let publishCalls = 0;
    let prepareCalls = 0;
    const application = {
      async runLoopPublish() {
        publishCalls += 1;
        return completedResult("run-prepared");
      },
      recordLoopRunHistory() {
        return Object.freeze({ written: true, ok: true });
      },
    };

    const result = await runDurableAutoSubscriptionPublish(application, {
      project: "example",
      candidateId: "H1-L1",
      expectedGitHead: "a".repeat(40),
      maxRepairs: 0,
      storeDirectory: root,
      owner: "worker:first",
      prepareExecution: async () => {
        prepareCalls += 1;
        const records = await readFileDurableExecutionRecords(root, "example");
        assert.equal(records.length, 1);
        assert.equal(records[0]?.status, "running");
        assert.equal(
          records[0]?.idempotencyKey,
          durableAutoSubscriptionKey("example", "H1-L1", "a".repeat(40)),
        );
      },
    });

    assert.equal(result.report.status, "completed");
    assert.equal(prepareCalls, 1);
    assert.equal(publishCalls, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("durable AUTO publish reports in_progress while preparation holds the lease", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-durable-auto-publish-"));
  try {
    let prepareCalls = 0;
    let publishCalls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const application = {
      async runLoopPublish() {
        publishCalls += 1;
        return completedResult("run-active");
      },
      recordLoopRunHistory() {
        return Object.freeze({ written: true, ok: true });
      },
    };

    const input = {
      project: "example",
      candidateId: "H1-L1",
      expectedGitHead: "a".repeat(40),
      maxRepairs: 0,
      storeDirectory: root,
      owner: "worker:first",
      prepareExecution: async () => {
        prepareCalls += 1;
        await gate;
      },
    } as const;

    const active = runDurableAutoSubscriptionPublish(application, input);
    for (let attempt = 0; attempt < 50 && prepareCalls === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(prepareCalls, 1);
    assert.equal(publishCalls, 0);

    const duplicate = await runDurableAutoSubscriptionPublish(application, {
      ...input,
      owner: "worker:second",
    });
    assert.equal(duplicate.exitCode, 0);
    assert.equal(duplicate.report.status, "in_progress");
    assert.equal(prepareCalls, 1);
    assert.equal(publishCalls, 0);

    release();
    const completed = await active;
    assert.equal(completed.report.status, "completed");
    assert.equal(publishCalls, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("durable AUTO publish terminalizes preparation failure without invoking the provider", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-durable-auto-publish-"));
  try {
    let publishCalls = 0;
    const application = {
      async runLoopPublish() {
        publishCalls += 1;
        return completedResult("unexpected-run");
      },
      recordLoopRunHistory() {
        return Object.freeze({ written: true, ok: true });
      },
    };

    const result = await runDurableAutoSubscriptionPublish(application, {
      project: "example",
      candidateId: "H1-L1",
      expectedGitHead: "a".repeat(40),
      maxRepairs: 0,
      storeDirectory: root,
      owner: "worker:first",
      prepareExecution: async () => {
        throw new Error("decision preparation failed");
      },
    });

    assert.equal(result.exitCode, 1);
    assert.equal(result.report.status, "failed");
    assert.equal(result.report.runId, null);
    assert.equal(result.report.historyRecorded, null);
    assert.equal(publishCalls, 0);

    const records = await readFileDurableExecutionRecords(root, "example");
    assert.equal(records.length, 1);
    assert.equal(records[0]?.status, "failed");
    assert.equal(records[0]?.failure?.code, "durable_execution_failed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("durable AUTO publish retries a failed terminal result only when explicitly requested", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-durable-auto-publish-"));
  try {
    let publishCalls = 0;
    let historyCalls = 0;
    const application = {
      async runLoopPublish() {
        publishCalls += 1;
        return publishCalls === 1
          ? failedResult("run-failed")
          : completedResult("run-retry");
      },
      recordLoopRunHistory() {
        historyCalls += 1;
        return Object.freeze({ written: true, ok: true });
      },
    };

    const input = {
      project: "example",
      candidateId: "H1-L1",
      expectedGitHead: "a".repeat(40),
      maxRepairs: 0,
      storeDirectory: root,
      owner: "worker:first",
    } as const;

    const first = await runDurableAutoSubscriptionPublish(application, input);
    const replay = await runDurableAutoSubscriptionPublish(application, {
      ...input,
      owner: "worker:replay",
    });
    const retry = await runDurableAutoSubscriptionPublish(application, {
      ...input,
      owner: "worker:retry",
      retryTerminal: true,
    });

    assert.equal(first.report.status, "failed");
    assert.equal(replay.report.status, "failed");
    assert.equal(retry.report.status, "completed");
    assert.equal(retry.report.runId, "run-retry");
    assert.equal(publishCalls, 2);
    assert.equal(historyCalls, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
