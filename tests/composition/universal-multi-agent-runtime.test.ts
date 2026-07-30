import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assembleLoopProviders,
  createLoopApplicationAssembly,
  defaultLoopProviderRegistry,
} from "../../src/composition/index.js";


describe("universal multi-agent runtime", () => {
  it("assembles Codex and Claude Code from declarative configuration", () => {
    const assemblies = assembleLoopProviders(defaultLoopProviderRegistry, [
      {
        id: "codex",
        executable: "/usr/local/bin/codex",
        model: "gpt-test",
      },
      {
        id: "claude_code",
        executable: "/usr/local/bin/claude",
        model: "claude-test",
        maxTurns: 8,
      },
    ]);

    assert.deepEqual(
      assemblies.map((assembly) => assembly.id),
      ["codex", "claude_code"],
    );
    assert.deepEqual(
      assemblies.flatMap((assembly) =>
        assembly.agentRegistry.profiles.map((profile) => ({
          id: profile.id,
          provider: profile.provider,
          runtime: profile.runtime,
          model: profile.model,
        })),
      ),
      [
        {
          id: "configured.codex",
          provider: "openai",
          runtime: "codex",
          model: "gpt-test",
        },
        {
          id: "configured.claude_code",
          provider: "anthropic",
          runtime: "claude_code",
          model: "claude-test",
        },
      ],
    );
  });

  it("builds one application executor and combined policy registry", () => {
    const application = createLoopApplicationAssembly({
      providers: [
        {
          id: "codex",
          executable: "/usr/local/bin/codex",
          model: "gpt-test",
        },
        {
          id: "claude_code",
          executable: "/usr/local/bin/claude",
          model: "claude-test",
          maxTurns: 6,
        },
      ],
      maxProviderAttempts: 2,
    });

    assert.equal(typeof application.loopExecutor, "function");
    assert.deepEqual(application.loopProviderIds, ["codex", "claude_code"]);
    assert.equal(application.loopProviderMaxAttempts, 2);
    assert.deepEqual(
      application.loopAgentRegistry?.profiles.map((profile) => profile.provider),
      ["openai", "anthropic"],
    );
    assert.equal(Object.isFrozen(application), true);
    assert.equal(Object.isFrozen(application.loopProviderIds), true);
  });

  it("rejects duplicate providers before constructing executors", () => {
    assert.throws(
      () =>
        assembleLoopProviders(defaultLoopProviderRegistry, [
          { id: "codex", executable: "codex" },
          { id: "codex", executable: "codex" },
        ]),
      /unique ids/,
    );
  });

  it("rejects ambiguous configuration modes", () => {
    assert.throws(
      () =>
        createLoopApplicationAssembly({
          provider: { id: "codex", executable: "codex" },
          providers: [{ id: "claude_code", executable: "claude" }],
        }),
      /exactly one/,
    );
  });

  it("preserves both historical single-provider compatibility paths", () => {
    const codex = createLoopApplicationAssembly({
      codexProvider: { executable: "codex" },
    });
    const claude = createLoopApplicationAssembly({
      claudeCodeProvider: { executable: "claude", maxTurns: 3 },
    });

    assert.deepEqual(codex.loopProviderIds, ["codex"]);
    assert.deepEqual(claude.loopProviderIds, ["claude_code"]);
    assert.equal(codex.loopAgentRegistry?.profiles[0]?.provider, "openai");
    assert.equal(claude.loopAgentRegistry?.profiles[0]?.provider, "anthropic");
  });
});
