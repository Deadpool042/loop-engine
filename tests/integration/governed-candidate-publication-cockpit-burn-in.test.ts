import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assembleLoopProvider,
  createIsolatedProviderRunExecute,
  defaultLoopProviderRegistry,
} from "../../src/composition/index.js";
import { createCandidatePublicationReview } from "../../src/composition/candidate-publication-review.js";
import { createIsolatedProviderRunPublish } from "../../src/composition/isolated-provider-publication.js";
import type { Config, ProjectConfig } from "../../src/core/config.js";
import { createCliInvoker } from "../../src/gui/cli-invoker.js";
import { createExecuteHandler } from "../../src/gui/desktop/execute-handler.js";
import type { LoopRunResult } from "../../src/loop/types.js";
import { ANTHROPIC_SONNET_5_MODEL } from "../../src/text-only-provider/pricing.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = resolve(
  currentDir,
  "..",
  "fixtures",
  "fake-claude",
  "claude",
);

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function sourceState(cwd: string): readonly string[] {
  return [
    git(cwd, ["rev-parse", "HEAD"]),
    git(cwd, ["status", "--porcelain=v1"]),
    git(cwd, ["diff"]),
    git(cwd, ["diff", "--cached"]),
    git(cwd, ["symbolic-ref", "--short", "HEAD"]),
    git(cwd, [
      "for-each-ref",
      "--format=%(refname) %(objectname)",
      "refs/heads",
    ]),
  ];
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "loop-v39-cockpit-publish-"));
  const source = join(root, "source");
  execFileSync("git", ["init", "-q", source]);
  git(source, ["config", "user.email", "test@example.com"]);
  git(source, ["config", "user.name", "Test"]);
  writeFileSync(join(source, "README.md"), "# Burn-in\n");
  writeFileSync(
    join(source, "ROADMAP.md"),
    [
      "# Roadmap",
      "",
      "| Lot | Livrable | État |",
      "| --- | --- | --- |",
      "| H1-L1 | Architecture candidate requiring long context | ⬜ À faire |",
      "",
    ].join("\n"),
  );
  git(source, ["add", "."]);
  git(source, ["commit", "-q", "-m", "test: baseline"]);

  const project: ProjectConfig = {
    name: "burn-in-fixture",
    path: source,
    type: "test",
    required_docs: [],
    validation: [],
    roadmap: ["ROADMAP.md"],
  };
  const config: Config = { projects: [project] };

  return {
    root,
    source,
    project,
    config,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe("V39 governed candidate publication cockpit burn-in", () => {
  it("publishes and reviews an architecture candidate through the desktop publish boundary without changing source state", async () => {
    const fixture = setup();
    const before = sourceState(fixture.source);
    let publishedResult: LoopRunResult | null = null;

    try {
      const provider = assembleLoopProvider(defaultLoopProviderRegistry, {
        id: "claude_code",
        executable: FAKE_CLAUDE,
        model: ANTHROPIC_SONNET_5_MODEL,
        timeoutMs: 5_000,
      });
      const runExecute = createIsolatedProviderRunExecute({
        executor: provider.executor,
        agentRegistry: provider.agentRegistry,
        resolveRepositoryPath: () => fixture.source,
        lockRoot: join(fixture.root, "locks"),
        workspaceRoot: join(fixture.root, "workspaces"),
        createAttemptId: () => "attempt-v39-burn-in",
      });
      const runPublish = createIsolatedProviderRunPublish({
        runExecute,
        loadConfig: () => fixture.config,
      });

      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      const cliInvoker = createCliInvoker({
        execute: async (_executable, args, cwd) => {
          assert.equal(cwd, "/trusted/loop-engine");
          assert.deepEqual(args, [
            "--silent",
            "loop",
            "run",
            "burn-in-fixture",
            "--candidate",
            "H1-L1",
            "--mode",
            "publish",
            "--provider",
            "claude_code",
            "--provider-executable",
            "claude",
            "--provider-model",
            ANTHROPIC_SONNET_5_MODEL,
            "--provider-timeout-ms",
            "600000",
            "--json",
          ]);

          const result = await runPublish(fixture.project.name, {
            candidateId: "H1-L1",
            loadConfig: () => fixture.config,
            generateRunId: () => "run-v39-burn-in",
          });
          publishedResult = result;
          return {
            stdout: JSON.stringify(result),
            stderr: "",
            exitCode: result.status === "failed" ? 1 : 0,
          };
        },
      });
      const handler = createExecuteHandler({
        cliInvoker,
        resolveRepositoryPath: () => "/trusted/loop-engine",
        choosePatchDestination: async () => {
          throw new Error("publish must not request a patch destination");
        },
      });

      const invocation = await handler({
        projectName: fixture.project.name,
        candidateId: "H1-L1",
        provider: "claude_code",
        model: ANTHROPIC_SONNET_5_MODEL,
        mode: "publish",
      });

      assert.equal(invocation.ok, true);
      if (!invocation.ok) return;
      const result = invocation.json as LoopRunResult;
      assert.equal(result.mode, "publish");
      assert.equal(result.status, "completed");
      assert.equal(result.failure, null);
      assert.equal(result.agentPolicy?.status, "resolved");
      assert.equal(result.agentPolicy?.requirements.category, "architecture");
      assert.deepEqual(result.agentPolicy?.requirements.requiredCapabilities, [
        "code_edit",
        "long_context",
      ]);
      assert.equal(
        result.agentPolicy?.selection?.outcome === "selected"
          ? result.agentPolicy.selection.profile.model
          : null,
        ANTHROPIC_SONNET_5_MODEL,
      );
      assert.deepEqual(result.modifiedFiles, ["provider-created.txt"]);
      assert.ok(result.publication);
      assert.equal(result.publication?.kind, "candidate_ref");
      assert.equal(
        result.publication?.ref,
        "refs/loop-engine/candidates/burn-in-fixture/run-v39-burn-in",
      );
      assert.equal(
        git(fixture.source, ["rev-parse", result.publication!.ref]),
        result.publication?.commitSha,
      );
      assert.equal(
        git(fixture.source, ["rev-parse", `${result.publication!.commitSha}^`]),
        result.publication?.baseSha,
      );
      assert.equal(
        git(fixture.source, [
          "show",
          `${result.publication!.commitSha}:provider-created.txt`,
        ]),
        "created",
      );
      assert.equal(
        existsSync(join(fixture.source, "provider-created.txt")),
        false,
      );
      assert.deepEqual(sourceState(fixture.source), before);

      const reviewCandidate = createCandidatePublicationReview({
        loadConfig: () => fixture.config,
        lookupRunHistoryEntry: (projectName, runId) => {
          assert.equal(projectName, fixture.project.name);
          assert.equal(runId, "run-v39-burn-in");
          assert.ok(publishedResult);
          return {
            found: true,
            entry: publishedResult!,
            corruptedLines: 0,
          };
        },
      });
      const review = await reviewCandidate(
        fixture.project.name,
        "run-v39-burn-in",
      );
      assert.equal(review.reviewed, true);
      if (!review.reviewed) return;
      assert.equal(review.review.candidateRef, result.publication?.ref);
      assert.equal(
        review.review.candidateCommitSha,
        result.publication?.commitSha,
      );
      assert.equal(review.review.baseSha, result.publication?.baseSha);
      assert.deepEqual(review.review.changedFiles, [
        {
          path: "provider-created.txt",
          status: "added",
          additions: 1,
          deletions: 0,
        },
      ]);
      assert.deepEqual(sourceState(fixture.source), before);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      fixture.cleanup();
    }
  });
});
