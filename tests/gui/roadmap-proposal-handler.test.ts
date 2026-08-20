import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRoadmapProposalHandler } from "../../src/gui/desktop/roadmap-proposal-handler.js";

describe("GUI roadmap proposal handler", () => {
  it("invokes roadmap propose with the fixed provider/model/timeout and injects the credential only into the child env", async () => {
    const invocations: Array<{ command: string; args: readonly string[]; cwd: string; env?: Readonly<Record<string, string>> }> = [];
    const handler = createRoadmapProposalHandler({
      cliInvoker: {
        async invoke(command, args, cwd, env) {
          invocations.push({ command, args, cwd, env });
          return { ok: true as const, json: { schemaVersion: 1 }, exitCode: 0 };
        },
      },
      resolveRepositoryPath: () => "/trusted/loop-engine",
      keychainReader: { read: async () => ({ ok: true as const, apiKey: "sk-test" }) },
    });

    const result = await handler("loop-engine");
    assert.equal(result.ok, true);
    assert.deepEqual(invocations, [
      {
        command: "roadmap",
        args: [
          "propose",
          "loop-engine",
          "--provider",
          "anthropic_api",
          "--provider-model",
          "claude-sonnet-5",
          "--provider-timeout-ms",
          "60000",
        ],
        cwd: "/trusted/loop-engine",
        env: { ANTHROPIC_API_KEY: "sk-test" },
      },
    ]);
  });

  it("does not call the CLI when the keychain credential is unavailable and returns a redacted failure", async () => {
    let invoked = false;
    const handler = createRoadmapProposalHandler({
      cliInvoker: {
        async invoke() {
          invoked = true;
          return { ok: false as const, kind: "spawn-error" as const, raw: "should not happen" };
        },
      },
      resolveRepositoryPath: () => "/trusted/loop-engine",
      keychainReader: { read: async () => ({ ok: false as const, reason: "unavailable" as const }) },
    });

    const result = await handler("loop-engine");
    assert.equal(invoked, false);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.doesNotMatch(result.raw, /sk-|api[_-]?key/i);
    }
  });

  it("rejects a non-string project name without resolving the repository or reading the credential", async () => {
    let resolved = false;
    let read = false;
    const handler = createRoadmapProposalHandler({
      cliInvoker: { async invoke() { throw new Error("must not be called"); } },
      resolveRepositoryPath: () => {
        resolved = true;
        return "/trusted/loop-engine";
      },
      keychainReader: {
        async read() {
          read = true;
          return { ok: true as const, apiKey: "sk-test" };
        },
      },
    });

    const result = await handler(42);
    assert.equal(result.ok, false);
    assert.equal(resolved, false);
    assert.equal(read, false);
  });

  it("propagates provider failures returned by the CLI invocation as-is", async () => {
    const handler = createRoadmapProposalHandler({
      cliInvoker: {
        async invoke() {
          return { ok: true as const, json: { schemaVersion: 1, result: { status: "failed", reason: "provider_error" } }, exitCode: 0 };
        },
      },
      resolveRepositoryPath: () => "/trusted/loop-engine",
      keychainReader: { read: async () => ({ ok: true as const, apiKey: "sk-test" }) },
    });

    const result = await handler("loop-engine");
    assert.equal(result.ok, true);
  });
});
