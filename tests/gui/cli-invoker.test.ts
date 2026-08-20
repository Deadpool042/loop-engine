import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createCliInvoker } from "../../src/gui/cli-invoker.js";

describe("GUI CliInvoker", () => {
  it("returns parsed JSON for successful CLI output", async () => {
    const invoker = createCliInvoker({
      execute: async (executable, args, cwd, timeoutMs) => {
        assert.equal(executable, "pnpm");
        assert.deepEqual(args, ["--silent", "loop", "summary", "--json"]);
        assert.equal(cwd, "/repo");
        assert.equal(timeoutMs, 15_000);
        return { stdout: '{"schemaVersion":1}', stderr: "", exitCode: 0 };
      },
    });

    assert.deepEqual(await invoker.invoke("summary", [], "/repo"), {
      ok: true,
      json: { schemaVersion: 1 },
      exitCode: 0,
    });
  });

  it("suppresses pnpm script output so the public JSON contract remains parseable", async () => {
    const invoker = createCliInvoker({
      execute: async (_executable, args) => {
        assert.deepEqual(args, ["--silent", "loop", "summary", "--json"]);
        return { stdout: '{"schemaVersion":1}', stderr: "", exitCode: 0 };
      },
    });

    const result = await invoker.invoke("summary", [], "/repo");
    assert.equal(result.ok, true);
  });

  it("preserves valid application JSON even with a non-zero exit", async () => {
    const invoker = createCliInvoker({
      execute: async () => ({
        stdout: '{"schemaVersion":1,"ok":false,"error":"missing_project"}',
        stderr: "",
        exitCode: 1,
      }),
    });

    const result = await invoker.invoke("context", [], "/repo");
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.exitCode, 1);
  });

  it("returns spawn-error for invalid JSON", async () => {
    const invoker = createCliInvoker({
      execute: async () => ({ stdout: "not-json", stderr: "raw stderr", exitCode: 2 }),
    });

    assert.deepEqual(await invoker.invoke("summary", [], "/repo"), {
      ok: false,
      kind: "spawn-error",
      raw: "raw stderr",
    });
  });

  it("forwards an explicit env override to the executor without requiring it by default", async () => {
    const invoker = createCliInvoker({
      execute: async (_executable, _args, _cwd, _timeoutMs, env) => {
        assert.deepEqual(env, { ANTHROPIC_API_KEY: "secret-value" });
        return { stdout: "{}", stderr: "", exitCode: 0 };
      },
    });

    const result = await invoker.invoke("roadmap", ["propose", "loop-engine"], "/repo", {
      ANTHROPIC_API_KEY: "secret-value",
    });
    assert.equal(result.ok, true);
  });

  it("returns spawn-error for spawn failures and timeouts", async () => {
    const invoker = createCliInvoker({
      timeoutMs: 50,
      execute: async () => {
        throw new Error("CLI invocation timed out.");
      },
    });

    assert.deepEqual(await invoker.invoke("summary", [], "/repo"), {
      ok: false,
      kind: "spawn-error",
      raw: "CLI invocation timed out.",
    });
  });
});
