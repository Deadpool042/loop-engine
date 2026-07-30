import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import type { AgentProfile } from "../../src/agents/types.js";
import { createLoopApplicationAssembly } from "../../src/composition/application-assembly.js";
import type { LoopProviderAssembly } from "../../src/composition/provider-registry.js";
import type { LoopExecutor } from "../../src/loop/execution.js";

function profile(
  id: string,
  provider: "openai" | "anthropic",
  runtime: "codex" | "claude_code",
): AgentProfile {
  return Object.freeze({
    id,
    provider,
    runtime,
    model: `${id}-model`,
    effort: "low",
    capabilities: Object.freeze(["code_edit"]),
    permissions: Object.freeze(["write_worktree"]),
    budget: Object.freeze({
      maxTokens: 1_000,
      maxCostUsd: 1,
      maxDurationMs: 10_000,
      maxCalls: 1,
      maxRepairs: 0,
    }),
  });
}

const executor: LoopExecutor = async () =>
  Object.freeze({
    status: "completed" as const,
    modifiedFiles: Object.freeze([]),
    details: Object.freeze([]),
  });

function assembly(id: string, selected: AgentProfile): LoopProviderAssembly {
  return Object.freeze({
    id: id as LoopProviderAssembly["id"],
    executor,
    agentRegistry: createAgentRegistry([selected]),
  });
}

test("application exposes one combined executor and ordered provider metadata", () => {
  const application = createLoopApplicationAssembly({
    providerAssemblies: [
      assembly("codex", profile("configured.codex", "openai", "codex")),
      assembly(
        "claude",
        profile("configured.claude", "anthropic", "claude_code"),
      ),
    ],
    maxProviderAttempts: 2,
  });

  assert.equal(typeof application.loopExecutor, "function");
  assert.deepEqual(application.loopProviderIds, ["codex", "claude"]);
  assert.equal(application.loopProviderId, "codex");
  assert.equal(application.loopProviderMaxAttempts, 2);
  assert.equal(application.loopAgentRegistry?.profiles.length, 2);
  assert.equal(Object.isFrozen(application.loopProviderIds), true);
});

test("single-provider configuration remains compatible", () => {
  const application = createLoopApplicationAssembly({
    codexProvider: { executable: "codex", model: "test-model" },
  });

  assert.deepEqual(application.loopProviderIds, ["codex"]);
  assert.equal(application.loopProviderMaxAttempts, 1);
  assert.equal(application.loopProviderId, "codex");
});

test("rejects ambiguous single and multi-provider configuration", () => {
  assert.throws(
    () =>
      createLoopApplicationAssembly({
        provider: { id: "codex", executable: "codex" },
        providerAssemblies: [
          assembly("codex", profile("configured.codex", "openai", "codex")),
        ],
      }),
    /never both/,
  );
});
