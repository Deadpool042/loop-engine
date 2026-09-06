import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  durableAutoSubscriptionKey,
  runDurableAutoSubscriptionPublish,
} from "../../src/composition/durable-auto-publish.js";
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

test("durable AUTO publish replays the same terminal result without a second execution", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-durable-auto-publish-"));
  try {
    let publishCalls = 0;
    let historyCalls = 0;
    const application = {
      async runLoopPublish() {
        publishCalls += 1;
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

test("durable AUTO publish reports in_progress while another owner holds the lease", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-durable-auto-publish-"));
  try {
    let publishCalls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const application = {
      async runLoopPublish() {
        publishCalls += 1;
        await gate;
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
    } as const;

    const active = runDurableAutoSubscriptionPublish(application, input);
    for (let attempt = 0; attempt < 50 && publishCalls === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(publishCalls, 1);

    const duplicate = await runDurableAutoSubscriptionPublish(application, {
      ...input,
      owner: "worker:second",
    });
    assert.equal(duplicate.exitCode, 0);
    assert.equal(duplicate.report.status, "in_progress");
    assert.equal(publishCalls, 1);

    release();
    const completed = await active;
    assert.equal(completed.report.status, "completed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
