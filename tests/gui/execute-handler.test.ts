import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCliInvoker } from "../../src/gui/cli-invoker.js";
import {
  APPROVED_DESKTOP_EXECUTE_PROVIDERS,
  createExecuteHandler,
  defaultPatchFilename,
} from "../../src/gui/desktop/execute-handler.js";

describe("GUI execute handler", () => {
  it("derives a stable, safe patch filename from project and candidate", () => {
    assert.equal(defaultPatchFilename("lp-infra", "H3-L2"), "lp-infra-H3-L2.patch");
    assert.equal(defaultPatchFilename("../LP Infra", "H3 / L2"), "LP-Infra-H3-L2.patch");
  });

  it("accepts only the renderer project, candidate and approved provider, then retains the trusted cwd", async () => {
    const calls: Array<readonly string[]> = [];
    const cwdValues: string[] = [];
    let patchDefault = "";
    const handler = createExecuteHandler({
      cliInvoker: createCliInvoker({
        timeoutMs: 900_000,
        execute: async (_executable, args, cwd) => {
          calls.push(args);
          cwdValues.push(cwd);
          return { stdout: '{"schemaVersion":1,"mode":"execute","status":"completed"}', stderr: "", exitCode: 0 };
        },
      }),
      resolveRepositoryPath: () => "/trusted/loop-engine",
      choosePatchDestination: async (defaultPath) => {
        patchDefault = defaultPath;
        return "/chosen/validated.patch";
      },
      destinationExists: () => false,
      parentDirectoryExists: () => true,
    });

    const result = await handler({
      projectName: "lp-infra",
      candidateId: "H1-L4",
      provider: "claude_code",
      model: "claude-sonnet-5",
    });

    assert.equal(result.ok, true);
    assert.equal(patchDefault, "lp-infra-H1-L4.patch");
    assert.deepEqual(cwdValues, ["/trusted/loop-engine"]);
    assert.deepEqual(calls, [
      [
        "--silent",
        "loop",
        "run",
        "lp-infra",
        "--candidate",
        "H1-L4",
        "--mode",
        "execute",
        "--provider",
        "claude_code",
        "--provider-executable",
        "claude",
        "--provider-model",
        "claude-sonnet-5",
        "--provider-timeout-ms",
        "600000",
        "--export-patch",
        "/chosen/validated.patch",
        "--json",
      ],
    ]);
    assert.equal(APPROVED_DESKTOP_EXECUTE_PROVIDERS.claude_code.executable, "claude");
  });

  it("does not invoke the CLI when the native patch dialog is cancelled or its destination is unsafe", async () => {
    let calls = 0;
    const cliInvoker = createCliInvoker({
      execute: async () => {
        calls += 1;
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    });
    const cancelled = createExecuteHandler({
      cliInvoker,
      resolveRepositoryPath: () => "/trusted/loop-engine",
      choosePatchDestination: async () => null,
      destinationExists: () => false,
      parentDirectoryExists: () => true,
    });
    const existing = createExecuteHandler({
      cliInvoker,
      resolveRepositoryPath: () => "/trusted/loop-engine",
      choosePatchDestination: async () => "/chosen/existing.patch",
      destinationExists: () => true,
      parentDirectoryExists: () => true,
    });

    assert.deepEqual(
      await cancelled({ projectName: "lp-infra", candidateId: "H1-L4", provider: "codex", model: "gpt-5.6-terra" }),
      { ok: false, kind: "cancelled", raw: "Patch destination selection was cancelled." },
    );
    assert.deepEqual(
      await existing({ projectName: "lp-infra", candidateId: "H1-L4", provider: "codex", model: "gpt-5.6-terra" }),
      { ok: false, kind: "spawn-error", raw: "Patch destination already exists." },
    );
    assert.equal(calls, 0);
  });

  it("rejects untrusted renderer values without opening the patch dialog", async () => {
    let chooserCalls = 0;
    const handler = createExecuteHandler({
      cliInvoker: createCliInvoker({ execute: async () => ({ stdout: "{}", stderr: "", exitCode: 0 }) }),
      resolveRepositoryPath: () => "/trusted/loop-engine",
      choosePatchDestination: async () => {
        chooserCalls += 1;
        return "/chosen/validated.patch";
      },
      destinationExists: () => false,
      parentDirectoryExists: () => true,
    });

    const result = await handler({
      projectName: "lp-infra",
      candidateId: "H1-L4",
      provider: "not-a-provider" as never,
      model: "untrusted-model",
    });

    assert.equal(result.ok, false);
    assert.equal(chooserCalls, 0);
  });

  it("publish mode invokes --mode publish without opening the patch dialog or requesting --export-patch", async () => {
    const calls: Array<readonly string[]> = [];
    let chooserCalls = 0;
    const handler = createExecuteHandler({
      cliInvoker: createCliInvoker({
        timeoutMs: 900_000,
        execute: async (_executable, args) => {
          calls.push(args);
          return { stdout: '{"schemaVersion":1,"mode":"publish","status":"completed"}', stderr: "", exitCode: 0 };
        },
      }),
      resolveRepositoryPath: () => "/trusted/loop-engine",
      choosePatchDestination: async () => {
        chooserCalls += 1;
        return "/chosen/validated.patch";
      },
      destinationExists: () => false,
      parentDirectoryExists: () => true,
    });

    const result = await handler({
      projectName: "lp-infra",
      candidateId: "H1-L4",
      provider: "claude_code",
      model: "claude-sonnet-5",
      mode: "publish",
    });

    assert.equal(result.ok, true);
    assert.equal(chooserCalls, 0);
    assert.deepEqual(calls, [
      [
        "--silent",
        "loop",
        "run",
        "lp-infra",
        "--candidate",
        "H1-L4",
        "--mode",
        "publish",
        "--provider",
        "claude_code",
        "--provider-executable",
        "claude",
        "--provider-model",
        "claude-sonnet-5",
        "--provider-timeout-ms",
        "600000",
        "--json",
      ],
    ]);
  });

  it("rejects an unrecognized mode value", async () => {
    const handler = createExecuteHandler({
      cliInvoker: createCliInvoker({ execute: async () => ({ stdout: "{}", stderr: "", exitCode: 0 }) }),
      resolveRepositoryPath: () => "/trusted/loop-engine",
      choosePatchDestination: async () => "/chosen/validated.patch",
      destinationExists: () => false,
      parentDirectoryExists: () => true,
    });

    const result = await handler({
      projectName: "lp-infra",
      candidateId: "H1-L4",
      provider: "claude_code",
      model: "claude-sonnet-5",
      mode: "commit",
    });

    assert.equal(result.ok, false);
  });
});
