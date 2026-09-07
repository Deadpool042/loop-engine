import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import type { AgentProfile } from "../../src/agents/types.js";
import { createLoopApplicationAssembly } from "../../src/composition/application-assembly.js";
import type { LoopProviderAssembly } from "../../src/composition/provider-registry.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";
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

function executionPlan(selected: AgentProfile): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1,
    runId: "application-failover-run",
    provider: selected.provider,
    runtime: selected.runtime,
    profileId: selected.id,
    model: selected.model,
    effort: selected.effort,
    budget: selected.budget,
    policy: Object.freeze({
      requiredCapabilities: Object.freeze(["code_edit"]),
      requiredPermissions: Object.freeze(["write_worktree"]),
      rationale: Object.freeze(["integration fixture"]),
    }),
  }) as LoopExecutionPlan;
}

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

test("application failover restores the original Git baseline before the fallback provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "loop-application-failover-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: root,
    });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    await writeFile(join(root, "README.md"), "baseline\n");
    execFileSync("git", ["add", "README.md"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "baseline"], { cwd: root });

    const primary = profile(
      "configured.claude.standard",
      "anthropic",
      "claude_code",
    );
    const fallback = profile(
      "configured.codex.standard",
      "openai",
      "codex",
    );
    let fallbackObservedClean = false;

    const primaryExecutor: LoopExecutor = async (_plan, cwd) => {
      await writeFile(join(cwd, "primary-leftover.txt"), "partial\n");
      return Object.freeze({
        status: "failed" as const,
        modifiedFiles: Object.freeze(["primary-leftover.txt"]),
        failure: Object.freeze({
          code: "provider_max_turns",
          message: "primary exhausted",
          details: Object.freeze([]),
        }),
      });
    };
    const fallbackExecutor: LoopExecutor = async (_plan, cwd) => {
      const status = execFileSync("git", ["status", "--porcelain=v1"], {
        cwd,
        encoding: "utf8",
      });
      fallbackObservedClean = status === "";
      await assert.rejects(readFile(join(cwd, "primary-leftover.txt"), "utf8"));
      await writeFile(join(cwd, "fallback-result.txt"), "done\n");
      return Object.freeze({
        status: "completed" as const,
        modifiedFiles: Object.freeze(["fallback-result.txt"]),
        details: Object.freeze(["fallback completed"]),
      });
    };

    const application = createLoopApplicationAssembly({
      providerAssemblies: [
        Object.freeze({
          id: "claude_code",
          executor: primaryExecutor,
          agentRegistry: createAgentRegistry([primary]),
        }),
        Object.freeze({
          id: "codex",
          executor: fallbackExecutor,
          agentRegistry: createAgentRegistry([fallback]),
        }),
      ],
      maxProviderAttempts: 2,
    });

    const result = await application.loopExecutor?.(
      executionPlan(primary),
      root,
    );

    assert.equal(result?.status, "completed");
    assert.equal(fallbackObservedClean, true);
    assert.deepEqual(result?.modifiedFiles, ["fallback-result.txt"]);
    assert.equal(
      execFileSync("git", ["status", "--porcelain=v1"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
      "?? fallback-result.txt",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    /Configure exactly one of provider, providers, providerAssemblies, or a legacy provider option/,
  );
});
