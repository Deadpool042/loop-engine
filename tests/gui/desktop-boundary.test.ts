import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { createCliInvoker } from "../../src/gui/cli-invoker.js";
import { createLoopDesktopApi } from "../../src/gui/desktop/desktop-api.js";
import { createContextHandler } from "../../src/gui/desktop/context-handler.js";
import { createPlanHandler } from "../../src/gui/desktop/plan-handler.js";
import { createReviewHandler } from "../../src/gui/desktop/review-handler.js";
import { createRunHistoryHandler, DESKTOP_RUN_HISTORY_LIMIT } from "../../src/gui/desktop/run-history-handler.js";
import { createSummaryHandler } from "../../src/gui/desktop/summary-handler.js";
import { resolveLoopEngineRepositoryPath } from "../../src/gui/repo-path-resolver.js";
import { createPatchReviewHandler } from "../../src/gui/desktop/patch-review-handler.js";

describe("GUI desktop execution boundary", () => {
  it("exposes only explicit renderer APIs", async () => {
    const calls: Array<readonly unknown[]> = [];
    const api = createLoopDesktopApi(async (channel, ...args) => {
      calls.push([channel, ...args]);
      return { ok: false, kind: "spawn-error", raw: "unavailable" };
    });

    assert.equal(api.summary.length, 0);
    assert.equal(api.plan.length, 2);
    assert.equal(api.execute.length, 1);
    assert.equal(api.startExecution.length, 1);
    assert.equal(api.executionSession.length, 1);
    assert.equal(api.cancelExecution.length, 1);
    assert.equal(api.patchReview.length, 1);
    assert.equal(api.roadmapProposal.length, 2);
    assert.equal(api.roadmapProposalEstimate.length, 1);
    assert.equal(api.gateReassessment.length, 2);
    assert.equal(api.gateReassessmentEstimate.length, 1);
    assert.equal(api.prepareExecutionDecision.length, 1);
    assert.equal(api.approveExecutionDecision.length, 1);
    await api.summary();
    await api.context("loop-engine");
    await api.review("loop-engine");
    await api.plan("lp-infra", "H1-L4");
    await api.execute({
      projectName: "lp-infra",
      candidateId: "H1-L4",
      provider: "codex",
      model: "gpt-5.6-terra",
    });
    await api.startExecution({
      projectName: "lp-infra",
      candidateId: "H1-L4",
      provider: "codex",
      model: "gpt-5.6-terra",
    });
    await api.executionSession("session-1");
    await api.cancelExecution("session-1");
    await api.patchReview("session-1");
    await api.roadmapProposal("loop-engine", "auto");
    await api.roadmapProposalEstimate("loop-engine");
    await api.gateReassessment("lp-infra", "auto");
    await api.gateReassessmentEstimate("lp-infra");
    await api.prepareExecutionDecision("lp-infra");
    await api.approveExecutionDecision("draft-1");
    assert.deepEqual(calls, [
      ["loop:summary"],
      ["loop:context", "loop-engine"],
      ["loop:review", "loop-engine"],
      ["loop:plan", "lp-infra", "H1-L4"],
      [
        "loop:execute",
        {
          projectName: "lp-infra",
          candidateId: "H1-L4",
          provider: "codex",
          model: "gpt-5.6-terra",
        },
      ],
      [
        "loop:execution-start",
        {
          projectName: "lp-infra",
          candidateId: "H1-L4",
          provider: "codex",
          model: "gpt-5.6-terra",
        },
      ],
      ["loop:execution-session", "session-1"],
      ["loop:execution-cancel", "session-1"],
      ["loop:patch-review", "session-1"],
      ["loop:roadmap-proposal", "loop-engine", "auto"],
      ["loop:roadmap-proposal-estimate", "loop-engine"],
      ["loop:gate-reassessment", "lp-infra", "auto"],
      ["loop:gate-reassessment-estimate", "lp-infra"],
      ["loop:execution-decision-prepare", "lp-infra"],
      ["loop:execution-decision-approve", "draft-1"],
    ]);
  });

  it("only accepts project name plus a closed profile selection for roadmapProposal, never provider/model/timeout/credential", async () => {
    const calls: Array<readonly unknown[]> = [];
    const api = createLoopDesktopApi(async (channel, ...args) => {
      calls.push([channel, ...args]);
      return { ok: false, kind: "spawn-error", raw: "unavailable" };
    });

    await api.roadmapProposal("loop-engine", "auto");
    assert.deepEqual(calls, [["loop:roadmap-proposal", "loop-engine", "auto"]]);
  });

  it("returns the summary invocation result through the renderer bridge", async () => {
    const expected = {
      ok: true as const,
      json: { schemaVersion: 1, projects: [] },
      exitCode: 0,
    };
    const api = createLoopDesktopApi(async (channel) => {
      assert.equal(channel, "loop:summary");
      return expected;
    });

    assert.deepEqual(await api.summary(), expected);
  });

  it("uses Forge's generated preload entry for the renderer bridge", () => {
    const mainSource = readFileSync(
      new URL("../../src/gui/desktop/main.ts", import.meta.url),
      "utf8",
    );

    assert.match(mainSource, /preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY/);
    assert.match(
      mainSource,
      /declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string/,
    );
    assert.match(mainSource, /ipcMain\.handle\("loop:execution-decision-prepare", \(_event, projectName\) => executionDecisionController\.prepare\(projectName\)\);/);
    assert.match(mainSource, /ipcMain\.handle\("loop:execution-decision-approve", \(_event, draftId\) => executionDecisionController\.approve\(draftId\)\);/);
  });

  it("forwards the renderer project-name argument past Electron's IPC event", () => {
    const mainSource = readFileSync(
      new URL("../../src/gui/desktop/main.ts", import.meta.url),
      "utf8",
    );

    assert.match(
      mainSource,
      /ipcMain\.handle\("loop:context", \(_event, projectName\) =>\s*contextHandler\(projectName\),\s*\)/s,
    );
    assert.match(
      mainSource,
      /ipcMain\.handle\("loop:review", \(_event, projectName\) =>\s*reviewHandler\(projectName\),\s*\)/s,
    );
    assert.match(
      mainSource,
      /ipcMain\.handle\("loop:plan", \(_event, projectName, candidateId\) =>\s*planHandler\(projectName, candidateId\),\s*\)/s,
    );
    assert.match(
      mainSource,
      /ipcMain\.handle\("loop:execution-start", \(_event, request\) =>\s*startExecutionSession\(request\),?\s*\)/s,
    );
    assert.match(
      mainSource,
      /ipcMain\.handle\("loop:execution-session", \(_event, sessionId\) =>\s*executionSessions\.get\(sessionId\),?\s*\)/s,
    );
    assert.match(
      mainSource,
      /ipcMain\.handle\("loop:execution-cancel", \(_event, sessionId\) =>\s*executionSessions\.cancel\(sessionId\),?\s*\)/s,
    );
    assert.match(
      mainSource,
      /ipcMain\.handle\(\s*"loop:roadmap-proposal",\s*\(_event, projectName, profileOverride\) =>\s*roadmapProposalHandler\(projectName, profileOverride\),\s*\)/s,
    );
    assert.match(
      mainSource,
      /ipcMain\.handle\("loop:roadmap-proposal-estimate", \(_event, projectName\) =>\s*roadmapProposalEstimateHandler\(projectName\),\s*\)/s,
    );
    assert.doesNotMatch(mainSource, /ipcMain\.handle\("loop:command"/);
  });

  it("does not let the main process wire provider, model, or timeout from an untrusted source for the proposal handler", () => {
    const mainSource = readFileSync(
      new URL("../../src/gui/desktop/main.ts", import.meta.url),
      "utf8",
    );

    assert.match(mainSource, /createRoadmapProposalHandler\(\{/);
    assert.match(
      mainSource,
      /keychainReader: createProviderKeychainReader\(\)/,
    );
  });

  it("accepts only a known session identity for patch review, never a path", async () => {
    const handler = createPatchReviewHandler({ getSession: () => null });
    assert.deepEqual(await handler("/arbitrary/path.patch"), { status: "no_patch" });
  });

  it("passes the renderer project name to review while retaining the trusted cwd", async () => {
    const cwdValues: string[] = [];
    const cliInvoker = createCliInvoker({
      execute: async (_executable, args, cwd) => {
        assert.deepEqual(args, [
          "--silent",
          "loop",
          "review",
          "creatyss",
          "--json",
        ]);
        cwdValues.push(cwd);
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    });
    const handler = createReviewHandler({
      cliInvoker,
      resolveRepositoryPath: () => "/trusted/loop-engine",
    });

    await handler("creatyss");

    assert.deepEqual(cwdValues, ["/trusted/loop-engine"]);
  });

  it("uses a fixed bounded runs invocation and trusted cwd", async () => {
    const cliInvoker = createCliInvoker({
      execute: async (_executable, args, cwd) => {
        assert.deepEqual(args, ["--silent", "loop", "runs", "creatyss", "--limit", String(DESKTOP_RUN_HISTORY_LIMIT), "--json"]);
        assert.equal(cwd, "/trusted/loop-engine");
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    });
    const handler = createRunHistoryHandler({ cliInvoker, resolveRepositoryPath: () => "/trusted/loop-engine" });
    await handler("creatyss");
  });

  it("passes the renderer project name to context while retaining the trusted cwd", async () => {
    const cwdValues: string[] = [];
    const cliInvoker = createCliInvoker({
      execute: async (_executable, args, cwd) => {
        assert.deepEqual(args, [
          "--silent",
          "loop",
          "context",
          "creatyss",
          "--json",
        ]);
        cwdValues.push(cwd);
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    });
    const handler = createContextHandler({
      cliInvoker,
      resolveRepositoryPath: () => "/trusted/loop-engine",
    });

    await handler("creatyss");

    assert.deepEqual(cwdValues, ["/trusted/loop-engine"]);
  });

  it("passes the renderer candidate binding to plan while retaining the trusted cwd", async () => {
    const cwdValues: string[] = [];
    const cliInvoker = createCliInvoker({
      execute: async (_executable, args, cwd) => {
        assert.deepEqual(args, [
          "--silent",
          "loop",
          "run",
          "lp-infra",
          "--candidate",
          "H1-L4",
          "--mode",
          "plan",
          "--json",
        ]);
        cwdValues.push(cwd);
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    });
    const handler = createPlanHandler({
      cliInvoker,
      resolveRepositoryPath: () => "/trusted/loop-engine",
    });

    await handler("lp-infra", "H1-L4");

    assert.deepEqual(cwdValues, ["/trusted/loop-engine"]);
  });

  it("uses only the configured or detected Loop Engine repository as CLI cwd", async () => {
    const trustedRepositoryPath = "/trusted/loop-engine";
    const cwdValues: string[] = [];
    const cliInvoker = createCliInvoker({
      execute: async (_executable, _args, cwd) => {
        cwdValues.push(cwd);
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    });
    const handler = createSummaryHandler({
      cliInvoker,
      resolveRepositoryPath: () =>
        resolveLoopEngineRepositoryPath({
          configuredRepositoryPath: trustedRepositoryPath,
          startPath: "/detected/loop-engine",
          resolver: {
            detect(path) {
              if (path === trustedRepositoryPath) return trustedRepositoryPath;
              if (path === "/detected/loop-engine")
                return "/detected/loop-engine";
              return null;
            },
          },
        }),
    });

    await handler("/renderer-controlled/repository" as never);

    assert.deepEqual(cwdValues, [trustedRepositoryPath]);
  });
});
