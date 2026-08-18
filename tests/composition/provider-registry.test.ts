import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assembleLoopProvider,
  codexProviderRegistration,
  createLoopProviderRegistry,
  defaultLoopProviderRegistry,
} from "../../src/composition/provider-registry.js";

describe("LoopProviderRegistry", () => {
  it("registers Codex once and assembles an executor with its matching agent profile", () => {
    const assembly = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "codex",
      executable: "/usr/local/bin/codex",
      model: "gpt-5.6-sol",
      timeoutMs: 1_000,
    });
    const [profile] = assembly.agentRegistry.profiles;

    assert.ok(profile);
    assert.equal(assembly.id, "codex");
    assert.equal(typeof assembly.executor, "function");
    assert.equal(assembly.agentRegistry.profiles.length, 1);
    assert.deepEqual(
      assembly.agentRegistry.profiles.map((candidate) => ({
        runtime: candidate.runtime,
        provider: candidate.provider,
        model: candidate.model,
      })),
      [{ runtime: "codex", provider: "openai", model: "gpt-5.6-sol" }],
    );
    assert.equal(Object.isFrozen(assembly), true);
    assert.equal(Object.isFrozen(profile), true);
  });

  it("uses the configured Codex default model and effort when no override is supplied", () => {
    const assembly = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "codex",
      executable: "/usr/local/bin/codex",
    });

    assert.deepEqual(assembly.agentRegistry.profiles.map((profile) => ({
      id: profile.id,
      model: profile.model,
      effort: profile.effort,
    })), [{ id: "configured.codex", model: "gpt-5.6-luna", effort: "low" }]);
  });

  it("binds a configured Codex model to its registered capability profile", () => {
    const assembly = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "codex",
      executable: "/usr/local/bin/codex",
      model: "gpt-5.6-sol",
    });

    assert.deepEqual(assembly.agentRegistry.profiles.map((profile) => ({
      model: profile.model,
      effort: profile.effort,
      capabilities: profile.capabilities,
    })), [{
      model: "gpt-5.6-sol",
      effort: "high",
      capabilities: ["code_edit", "shell_exec", "test_execution", "multi_file_refactor", "long_context"],
    }]);
  });

  it("rejects duplicate provider registrations deterministically", () => {
    assert.throws(
      () =>
        createLoopProviderRegistry([
          codexProviderRegistration,
          codexProviderRegistration,
        ]),
      /Duplicate provider registration: codex/,
    );
  });

  it("keeps registry ordering immutable", () => {
    const registry = createLoopProviderRegistry([codexProviderRegistration]);

    assert.equal(Object.isFrozen(registry), true);
    assert.equal(Object.isFrozen(registry.registrations), true);
    assert.deepEqual(
      registry.registrations.map((registration) => registration.id),
      ["codex"],
    );
  });
});
