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

    assert.equal(assembly.id, "codex");
    assert.equal(typeof assembly.executor, "function");
    assert.equal(assembly.agentRegistry.profiles.length, 1);
    assert.deepEqual(
      assembly.agentRegistry.profiles.map((profile) => ({
        runtime: profile.runtime,
        provider: profile.provider,
        model: profile.model,
      })),
      [{ runtime: "codex", provider: "openai", model: "gpt-5.6-sol" }],
    );
    assert.equal(Object.isFrozen(assembly), true);
    assert.equal(Object.isFrozen(assembly.agentRegistry.profiles[0]), true);
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
