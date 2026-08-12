import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCliInvoker } from "../../src/gui/cli-invoker.js";
import {
  APPROVED_DESKTOP_EXECUTE_PROVIDERS,
  createExecuteHandler,
} from "../../src/gui/desktop/execute-handler.js";

describe("GUI execute handler", () => {
  it("accepts only the renderer project, candidate and approved provider, then retains the trusted cwd", async () => {
    const calls: Array<readonly string[]> = [];
    const cwdValues: string[] = [];
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
      choosePatchDestination: async () => "/chosen/validated.patch",
      destinationExists: () => false,
      parentDirectoryExists: () => true,
    });

    const result = await handler({
      projectName: "lp-infra",
      candidateId: "H1-L4",
      provider: "claude_code",
    });

    assert.equal(result.ok, true);
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
      await cancelled({ projectName: "lp-infra", candidateId: "H1-L4", provider: "codex" }),
      { ok: false, kind: "cancelled", raw: "Patch destination selection was cancelled." },
    );
    assert.deepEqual(
      await existing({ projectName: "lp-infra", candidateId: "H1-L4", provider: "codex" }),
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
    });

    assert.equal(result.ok, false);
    assert.equal(chooserCalls, 0);
  });
});
