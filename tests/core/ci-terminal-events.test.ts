import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ciTerminalEventType,
  readCiTerminalEvent,
  recordCiTerminalEvent,
} from "../../src/core/ci-terminal-events.js";

function createRecord(overrides: Partial<Parameters<typeof recordCiTerminalEvent>[0]> = {}) {
  return {
    schemaVersion: 1 as const,
    project: "creatyss",
    repository: "Deadpool042/CREATYSS",
    sha: "a".repeat(40),
    conclusion: "success" as const,
    workflow: "CI",
    runId: "123456789",
    runAttempt: 1,
    runUrl: "https://github.com/Deadpool042/CREATYSS/actions/runs/123456789",
    prNumber: 524,
    branch: "test/vnext3-g3-m13-gifting-checkout-e2e",
    occurredAt: "2026-09-10T12:00:00.000Z",
    ...overrides,
  };
}

test("records and reads one bounded CI terminal snapshot atomically", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-ci-events-"));
  try {
    const record = createRecord();
    const outcome = recordCiTerminalEvent(record, root);

    assert.equal(outcome.ok, true);
    assert.deepEqual(readCiTerminalEvent("creatyss", root), record);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("replaces the current snapshot without accumulating duplicate state", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-ci-events-"));
  try {
    recordCiTerminalEvent(createRecord(), root);
    const failed = createRecord({
      conclusion: "failure",
      runAttempt: 2,
      occurredAt: "2026-09-10T12:05:00.000Z",
    });
    recordCiTerminalEvent(failed, root);

    assert.deepEqual(readCiTerminalEvent("creatyss", root), failed);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects arbitrary run URLs and invalid branch data", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-ci-events-"));
  try {
    assert.throws(
      () =>
        recordCiTerminalEvent(
          createRecord({ runUrl: "https://example.com/not-github" }),
          root,
        ),
      /invalid_run_url/,
    );
    assert.throws(
      () => recordCiTerminalEvent(createRecord({ branch: "bad branch" }), root),
      /invalid_branch/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("maps success to ci.green and failure/cancelled to ci.failed", () => {
  assert.equal(ciTerminalEventType("success"), "ci.green");
  assert.equal(ciTerminalEventType("failure"), "ci.failed");
  assert.equal(ciTerminalEventType("cancelled"), "ci.failed");
});
