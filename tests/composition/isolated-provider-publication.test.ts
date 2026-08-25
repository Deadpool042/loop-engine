import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createIsolatedProviderRunPublish } from "../../src/composition/isolated-provider-publication.js";
import type { LoopRunResult } from "../../src/loop/types.js";

const execution = {
  schemaVersion: 1,
  runId: "run-publish",
  project: "project-a",
  mode: "execute",
  status: "completed",
  startedAt: "2026-08-25T00:00:00.000Z",
  completedAt: "2026-08-25T00:00:01.000Z",
  candidate: null,
  steps: [],
  validation: {
    status: "passed",
    attempts: 1,
    repairAttempts: 0,
    commands: [],
    failedCommand: null,
    exitCode: 0,
  },
  modifiedFiles: ["file.ts"],
  commit: null,
  patchExport: {
    path: "unused",
    sha256: "a".repeat(64),
    fileCount: 1,
    baseSha: "b".repeat(40),
  },
  publication: null,
  failure: null,
  agentPolicy: null,
  contextPackage: null,
} as const satisfies LoopRunResult;

describe("isolated provider candidate publication", () => {
  it("uses the existing isolated execute result and exposes only compact publication evidence", async () => {
    let exportPatchPath: string | undefined;
    const publish = createIsolatedProviderRunPublish({
      runExecute: async (_project, options) => {
        exportPatchPath = options?.exportPatchPath;
        return execution;
      },
      loadConfig: () => ({ projects: [] }) as never,
      findProject: () =>
        ({ name: "project-a", path: "/tmp/project-a" }) as never,
      candidatePublisher: async (input) => {
        assert.equal(input.runId, "run-publish");
        assert.equal(input.baseSha, "b".repeat(40));
        assert.equal(input.patchSha256, "a".repeat(64));
        assert.equal(input.patchPath, exportPatchPath);
        return {
          published: true,
          publication: {
            kind: "candidate_ref" as const,
            ref: "refs/loop-engine/candidates/project-a/run-publish",
            commitSha: "c".repeat(40),
            baseSha: "b".repeat(40),
          },
        };
      },
    });

    const result = await publish("project-a");
    assert.equal(result.mode, "publish");
    assert.equal(result.status, "completed");
    assert.equal(result.patchExport, null);
    assert.deepEqual(result.publication, {
      kind: "candidate_ref",
      ref: "refs/loop-engine/candidates/project-a/run-publish",
      commitSha: "c".repeat(40),
      baseSha: "b".repeat(40),
    });
  });

  it("never publishes when isolated validation did not complete", async () => {
    let publisherCalled = false;
    const publish = createIsolatedProviderRunPublish({
      runExecute: async () => ({
        ...execution,
        status: "failed",
        patchExport: null,
      }),
      candidatePublisher: async () => {
        publisherCalled = true;
        throw new Error("must not run");
      },
    });
    const result = await publish("project-a");
    assert.equal(publisherCalled, false);
    assert.equal(result.mode, "publish");
    assert.equal(result.publication, null);
  });

  it("clarifies agent policy rejection as a publish prerequisite failure", async () => {
    let publisherCalled = false;
    const publish = createIsolatedProviderRunPublish({
      runExecute: async () => ({
        ...execution,
        status: "failed",
        validation: null,
        patchExport: null,
        failure: {
          code: "agent_policy_rejected",
          message: "Agent policy did not admit execute mode.",
          details: ["configured.claude_code: missing capabilities: long_context"],
        },
      }),
      candidatePublisher: async () => {
        publisherCalled = true;
        throw new Error("must not run");
      },
    });

    const result = await publish("project-a");
    assert.equal(publisherCalled, false);
    assert.equal(result.mode, "publish");
    assert.equal(result.publication, null);
    assert.equal(result.failure?.code, "agent_policy_rejected");
    assert.equal(
      result.failure?.message,
      "Candidate publication was not attempted because its prerequisite execution phase was rejected by agent policy.",
    );
    assert.deepEqual(result.failure?.details, [
      "configured.claude_code: missing capabilities: long_context",
    ]);
  });
});
