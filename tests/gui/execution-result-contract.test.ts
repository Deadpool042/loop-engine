import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseExecutionResultDetail } from "../../src/gui/desktop/execution-result-contract.js";

function completedResult(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    runId: "run-1",
    project: "lp-infra",
    mode: "execute",
    status: "completed",
    startedAt: "2026-08-24T10:00:00.000Z",
    completedAt: "2026-08-24T10:05:00.000Z",
    candidate: null,
    steps: [],
    validation: {
      status: "passed",
      attempts: 2,
      repairAttempts: 1,
      commands: ["pnpm run validate"],
      failedCommand: null,
      exitCode: 0,
    },
    modifiedFiles: ["src/foo.ts", "tests/foo.test.ts"],
    commit: null,
    patchExport: {
      path: "/tmp/change.patch",
      sha256: "a".repeat(64),
      fileCount: 2,
    },
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
    ...overrides,
  };
}

function failedResult(overrides: Record<string, unknown> = {}) {
  return {
    ...completedResult(),
    status: "failed",
    validation: {
      status: "failed",
      attempts: 3,
      repairAttempts: 3,
      commands: ["pnpm run validate"],
      failedCommand: "pnpm run validate",
      exitCode: 1,
    },
    patchExport: null,
    failure: {
      code: "validation_failed",
      message: "Validation failed after bounded repair attempts.",
      details: [],
    },
    ...overrides,
  };
}

describe("GUI execution result contract", () => {
  it("parses a completed result with modified files, validation and patch export", () => {
    const detail = parseExecutionResultDetail(completedResult());
    assert.deepEqual(detail, {
      status: "completed",
      modifiedFiles: ["src/foo.ts", "tests/foo.test.ts"],
      validation: {
        status: "passed",
        attempts: 2,
        repairAttempts: 1,
        failedCommand: null,
        exitCode: 0,
      },
      patchExport: {
        path: "/tmp/change.patch",
        sha256: "a".repeat(64),
        fileCount: 2,
      },
      failure: null,
    });
  });

  it("parses a failed result with structured failure and no patch export", () => {
    const detail = parseExecutionResultDetail(failedResult());
    assert.deepEqual(detail, {
      status: "failed",
      modifiedFiles: ["src/foo.ts", "tests/foo.test.ts"],
      validation: {
        status: "failed",
        attempts: 3,
        repairAttempts: 3,
        failedCommand: "pnpm run validate",
        exitCode: 1,
      },
      patchExport: null,
      failure: {
        code: "validation_failed",
        message: "Validation failed after bounded repair attempts.",
        details: [],
      },
    });
  });

  it("parses a blocked result carrying a structured failure and no validation", () => {
    const detail = parseExecutionResultDetail(
      failedResult({ status: "blocked", validation: null }),
    );
    assert.equal(detail?.status, "blocked");
    assert.equal(detail?.validation, null);
  });

  it("treats a missing patchExport field the same as an explicit null", () => {
    const { patchExport: _omitted, ...withoutPatchExport } = completedResult();
    const detail = parseExecutionResultDetail(withoutPatchExport);
    assert.equal(detail?.patchExport, null);
  });

  it("rejects malformed input fail-closed", () => {
    assert.equal(parseExecutionResultDetail(null), null);
    assert.equal(parseExecutionResultDetail(undefined), null);
    assert.equal(parseExecutionResultDetail("completed"), null);
    assert.equal(parseExecutionResultDetail({}), null);
    assert.equal(
      parseExecutionResultDetail(completedResult({ schemaVersion: 2 })),
      null,
    );
    assert.equal(
      parseExecutionResultDetail(completedResult({ status: "executing" })),
      null,
    );
    assert.equal(
      parseExecutionResultDetail(completedResult({ modifiedFiles: null })),
      null,
    );
    assert.equal(
      parseExecutionResultDetail(completedResult({ modifiedFiles: [1, 2, 3] })),
      null,
    );
  });

  it("rejects a non-terminal status such as an in-progress cycle snapshot", () => {
    for (const status of [
      "idle",
      "planning",
      "ready",
      "executing",
      "validating",
      "repairing",
      "cancelled",
    ]) {
      assert.equal(
        parseExecutionResultDetail(completedResult({ status })),
        null,
        `expected status "${status}" to be rejected`,
      );
    }
  });

  it("rejects an ambiguous partial structure rather than displaying an incorrect result", () => {
    // completed status must not carry a failure
    assert.equal(
      parseExecutionResultDetail(
        completedResult({
          failure: { code: "x", message: "y", details: [] },
        }),
      ),
      null,
    );
    // failed status must carry a failure
    assert.equal(
      parseExecutionResultDetail(failedResult({ failure: null })),
      null,
    );
    // malformed validation sub-object invalidates the whole result
    assert.equal(
      parseExecutionResultDetail(
        completedResult({ validation: { status: "passed" } }),
      ),
      null,
    );
    // malformed patchExport sub-object invalidates the whole result
    assert.equal(
      parseExecutionResultDetail(
        completedResult({ patchExport: { path: "/tmp/x.patch" } }),
      ),
      null,
    );
    // malformed failure sub-object invalidates the whole result
    assert.equal(
      parseExecutionResultDetail(
        failedResult({ failure: { code: "x", message: "y" } }),
      ),
      null,
    );
  });
});
