import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createRoadmapProposalHandler } from "../../src/gui/desktop/roadmap-proposal-handler.js";

type Invocation = Readonly<{
  command: string;
  args: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string>>;
}>;

function createHarness() {
  const invocations: Invocation[] = [];
  const handler = createRoadmapProposalHandler({
    cliInvoker: {
      async invoke(command, args, cwd, env) {
        invocations.push({ command, args, cwd, env });
        return { ok: true as const, json: { schemaVersion: 1 }, exitCode: 0 };
      },
    },
    resolveRepositoryPath: () => "/trusted/loop-engine",
    keychainReader: {
      read: async () => ({ ok: true as const, apiKey: "sk-test" }),
    },
  });
  return { handler, invocations };
}

describe("GUI roadmap proposal handler", () => {
  it("keeps auto mode provider/model-free so the CLI applies deterministic recommendation routing", async () => {
    const { handler, invocations } = createHarness();

    const result = await handler("loop-engine", "auto");
    assert.equal(result.ok, true);
    assert.deepEqual(invocations, [
      {
        command: "roadmap",
        args: [
          "propose",
          "loop-engine",
          "--provider",
          "anthropic_api",
          "--provider-timeout-ms",
          "60000",
        ],
        cwd: "/trusted/loop-engine",
        env: { ANTHROPIC_API_KEY: "sk-test" },
      },
    ]);
  });

  it("maps the closed economy override to Haiku with no effort", async () => {
    const { handler, invocations } = createHarness();
    await handler("loop-engine", "economy");

    assert.deepEqual(invocations[0]?.args, [
      "propose",
      "loop-engine",
      "--provider",
      "anthropic_api",
      "--provider-model",
      "claude-haiku-4-5",
      "--provider-timeout-ms",
      "60000",
    ]);
  });

  it("maps balanced/deep to the canonical Sonnet 5 low/medium effort pairs", async () => {
    const balanced = createHarness();
    await balanced.handler("loop-engine", "balanced");
    assert.deepEqual(balanced.invocations[0]?.args, [
      "propose",
      "loop-engine",
      "--provider",
      "anthropic_api",
      "--provider-model",
      "claude-sonnet-5",
      "--provider-effort",
      "low",
      "--provider-timeout-ms",
      "60000",
    ]);

    const deep = createHarness();
    await deep.handler("loop-engine", "deep");
    assert.deepEqual(deep.invocations[0]?.args, [
      "propose",
      "loop-engine",
      "--provider",
      "anthropic_api",
      "--provider-model",
      "claude-sonnet-5",
      "--provider-effort",
      "medium",
      "--provider-timeout-ms",
      "60000",
    ]);
  });

  it("rejects arbitrary model/effort-like renderer values before repository or credential access", async () => {
    let resolved = false;
    let read = false;
    const handler = createRoadmapProposalHandler({
      cliInvoker: {
        async invoke() {
          throw new Error("must not be called");
        },
      },
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

    const result = await handler("loop-engine", "claude-opus-custom");
    assert.equal(result.ok, false);
    assert.equal(resolved, false);
    assert.equal(read, false);
  });

  it("does not call the CLI when the keychain credential is unavailable and returns a redacted failure", async () => {
    let invoked = false;
    const handler = createRoadmapProposalHandler({
      cliInvoker: {
        async invoke() {
          invoked = true;
          return {
            ok: false as const,
            kind: "spawn-error" as const,
            raw: "should not happen",
          };
        },
      },
      resolveRepositoryPath: () => "/trusted/loop-engine",
      keychainReader: {
        read: async () => ({
          ok: false as const,
          reason: "unavailable" as const,
        }),
      },
    });

    const result = await handler("loop-engine", "auto");
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
      cliInvoker: {
        async invoke() {
          throw new Error("must not be called");
        },
      },
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

    const result = await handler(42, "auto");
    assert.equal(result.ok, false);
    assert.equal(resolved, false);
    assert.equal(read, false);
  });

  it("propagates provider failures returned by the CLI invocation as-is", async () => {
    const handler = createRoadmapProposalHandler({
      cliInvoker: {
        async invoke() {
          return {
            ok: true as const,
            json: {
              schemaVersion: 1,
              result: { status: "failed", reason: "provider_error" },
            },
            exitCode: 0,
          };
        },
      },
      resolveRepositoryPath: () => "/trusted/loop-engine",
      keychainReader: {
        read: async () => ({ ok: true as const, apiKey: "sk-test" }),
      },
    });

    const result = await handler("loop-engine", "balanced");
    assert.equal(result.ok, true);
  });
});
