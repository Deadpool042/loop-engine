import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectAgentProfile } from "../../src/agents/selector.js";
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

  it("uses the configured Codex default model and a neutral ranking effort when no override is supplied", () => {
    const assembly = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "codex",
      executable: "/usr/local/bin/codex",
    });

    assert.deepEqual(
      assembly.agentRegistry.profiles.map((profile) => ({
        id: profile.id,
        model: profile.model,
        effort: profile.effort,
      })),
      [{ id: "configured.codex", model: "gpt-5.6-luna", effort: "low" }],
    );
  });

  it("does not inherit model-specific capabilities or invented budgets from the illustrative forecast registry", () => {
    const assembly = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "codex",
      executable: "/usr/local/bin/codex",
      model: "gpt-5.6-sol",
      timeoutMs: 42_000,
    });

    assert.deepEqual(
      assembly.agentRegistry.profiles.map((profile) => ({
        model: profile.model,
        effort: profile.effort,
        capabilities: profile.capabilities,
        permissions: profile.permissions,
        budget: profile.budget,
      })),
      [
        {
          model: "gpt-5.6-sol",
          effort: "low",
          capabilities: ["code_edit", "shell_exec", "test_execution"],
          permissions: ["read_only", "write_worktree", "shell_exec"],
          budget: {
            maxTokens: null,
            maxCostUsd: null,
            maxDurationMs: 42_000,
            maxCalls: 1,
            maxRepairs: 1,
          },
        },
      ],
    );
  });

  it("takes enriched capabilities from explicit profile configuration instead of commercial model names", () => {
    const assembly = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "claude_code",
      executable: "/usr/local/bin/claude",
      profiles: [
        {
          id: "standard",
          model: "claude-sonnet-5",
          economicTier: "standard",
          capabilities: [
            "code_edit",
            "shell_exec",
            "test_execution",
            "long_context",
          ],
        },
      ],
    });

    const [profile] = assembly.agentRegistry.profiles;
    assert.ok(profile);
    assert.equal(profile.id, "configured.claude_code.standard");
    assert.equal(profile.economicTier, "standard");
    assert.equal(profile.availability, "available");
    assert.deepEqual(profile.capabilities, [
      "code_edit",
      "shell_exec",
      "test_execution",
      "long_context",
    ]);
  });

  it("represents the current four-level OpenAI and Anthropic portfolios as configurable data", () => {
    const codex = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "codex",
      executable: "/usr/local/bin/codex",
      profiles: [
        {
          id: "economy",
          model: "gpt-5.6-luna",
          economicTier: "economy",
          capabilities: ["code_edit", "shell_exec", "test_execution"],
        },
        {
          id: "standard",
          model: "gpt-5.6-terra",
          economicTier: "standard",
          capabilities: ["code_edit", "shell_exec", "test_execution"],
        },
        {
          id: "advanced",
          model: "gpt-5.6-sol",
          economicTier: "advanced",
          capabilities: [
            "code_edit",
            "shell_exec",
            "test_execution",
            "long_context",
            "multi_file_refactor",
          ],
        },
        {
          id: "frontier",
          model: "gpt-6-astra",
          economicTier: "frontier",
          availability: "unavailable",
          capabilities: [
            "code_edit",
            "shell_exec",
            "test_execution",
            "long_context",
            "multi_file_refactor",
          ],
        },
      ],
    });
    const claude = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "claude_code",
      executable: "/usr/local/bin/claude",
      profiles: [
        {
          id: "economy",
          model: "claude-haiku-4-5",
          economicTier: "economy",
          capabilities: ["code_edit", "shell_exec", "test_execution"],
        },
        {
          id: "standard",
          model: "claude-sonnet-5",
          economicTier: "standard",
          capabilities: [
            "code_edit",
            "shell_exec",
            "test_execution",
            "long_context",
          ],
        },
        {
          id: "advanced",
          model: "claude-opus-5",
          economicTier: "advanced",
          capabilities: [
            "code_edit",
            "shell_exec",
            "test_execution",
            "long_context",
            "multi_file_refactor",
          ],
        },
        {
          id: "frontier",
          model: "claude-fable-5-1",
          economicTier: "frontier",
          capabilities: [
            "code_edit",
            "shell_exec",
            "test_execution",
            "long_context",
            "multi_file_refactor",
          ],
        },
      ],
    });

    assert.deepEqual(
      codex.agentRegistry.profiles.map((profile) => ({
        id: profile.id,
        model: profile.model,
        economicTier: profile.economicTier,
        availability: profile.availability,
      })),
      [
        {
          id: "configured.codex.economy",
          model: "gpt-5.6-luna",
          economicTier: "economy",
          availability: "available",
        },
        {
          id: "configured.codex.standard",
          model: "gpt-5.6-terra",
          economicTier: "standard",
          availability: "available",
        },
        {
          id: "configured.codex.advanced",
          model: "gpt-5.6-sol",
          economicTier: "advanced",
          availability: "available",
        },
        {
          id: "configured.codex.frontier",
          model: "gpt-6-astra",
          economicTier: "frontier",
          availability: "unavailable",
        },
      ],
    );
    assert.deepEqual(
      claude.agentRegistry.profiles.map((profile) => profile.model),
      [
        "claude-haiku-4-5",
        "claude-sonnet-5",
        "claude-opus-5",
        "claude-fable-5-1",
      ],
    );
  });


  it("selects the cheapest admissible configured profile independently of declaration order", () => {
    const profiles = [
      {
        id: "economy",
        model: "gpt-5.6-luna",
        economicTier: "economy" as const,
        capabilities: ["code_edit", "shell_exec", "test_execution"] as const,
      },
      {
        id: "standard",
        model: "gpt-5.6-terra",
        economicTier: "standard" as const,
        capabilities: ["code_edit", "shell_exec", "test_execution"] as const,
      },
      {
        id: "advanced",
        model: "gpt-5.6-sol",
        economicTier: "advanced" as const,
        capabilities: [
          "code_edit",
          "shell_exec",
          "test_execution",
          "long_context",
        ] as const,
      },
    ];

    const first = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "codex",
      executable: "/usr/local/bin/codex",
      profiles,
    });
    const second = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "codex",
      executable: "/usr/local/bin/codex",
      profiles: [...profiles].reverse(),
    });

    const request = {
      requiredCapabilities: ["code_edit", "shell_exec"] as const,
      requiredPermissions: ["write_worktree"] as const,
    };
    const firstSelection = selectAgentProfile(first.agentRegistry, request);
    const secondSelection = selectAgentProfile(second.agentRegistry, request);

    assert.equal(
      firstSelection.outcome === "selected"
        ? firstSelection.profile.model
        : null,
      "gpt-5.6-luna",
    );
    assert.deepEqual(firstSelection, secondSelection);
  });

  it("falls back to the next configured economic tier when the cheaper model is unavailable", () => {
    const assembly = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "codex",
      executable: "/usr/local/bin/codex",
      profiles: [
        {
          id: "economy",
          model: "gpt-5.6-luna",
          economicTier: "economy",
          availability: "unavailable",
          capabilities: ["code_edit", "shell_exec", "test_execution"],
        },
        {
          id: "standard",
          model: "gpt-5.6-terra",
          economicTier: "standard",
          capabilities: ["code_edit", "shell_exec", "test_execution"],
        },
        {
          id: "advanced",
          model: "gpt-5.6-sol",
          economicTier: "advanced",
          capabilities: [
            "code_edit",
            "shell_exec",
            "test_execution",
            "long_context",
          ],
        },
      ],
    });

    const selection = selectAgentProfile(assembly.agentRegistry, {
      requiredCapabilities: ["code_edit", "shell_exec"],
      requiredPermissions: ["write_worktree"],
    });

    assert.equal(selection.outcome, "selected");
    assert.equal(
      selection.outcome === "selected" ? selection.profile.model : null,
      "gpt-5.6-terra",
    );
    assert.deepEqual(selection.rejected, [
      {
        profileId: "configured.codex.economy",
        reason: "profile is explicitly unavailable",
      },
    ]);
    assert.deepEqual(
      selection.outcome === "selected" ? selection.notSelected : null,
      [
        {
          profileId: "configured.codex.advanced",
          reason: "higher_economic_tier_than_selected",
        },
      ],
    );
  });

  it("rejects ambiguous model/profile configuration and duplicate profile ids", () => {
    assert.throws(
      () =>
        assembleLoopProvider(defaultLoopProviderRegistry, {
          id: "codex",
          executable: "/usr/local/bin/codex",
          model: "gpt-5.6-luna",
          profiles: [
            {
              id: "economy",
              model: "gpt-5.6-luna",
              economicTier: "economy",
              capabilities: ["code_edit", "shell_exec", "test_execution"],
            },
          ],
        }),
      /either model or profiles/,
    );
    assert.throws(
      () =>
        assembleLoopProvider(defaultLoopProviderRegistry, {
          id: "codex",
          executable: "/usr/local/bin/codex",
          profiles: [
            {
              id: "same",
              model: "model-a",
              economicTier: "economy",
              capabilities: ["code_edit", "shell_exec", "test_execution"],
            },
            {
              id: "same",
              model: "model-b",
              economicTier: "standard",
              capabilities: ["code_edit", "shell_exec", "test_execution"],
            },
          ],
        }),
      /Duplicate configured provider profile id: same/,
    );
  });

  it("keeps an unknown enterprise model alias inside the same conservative provider-bound envelope", () => {
    const assembly = assembleLoopProvider(defaultLoopProviderRegistry, {
      id: "claude_code",
      executable: "/usr/local/bin/claude",
      model: "enterprise-sonnet-alias",
    });

    const [profile] = assembly.agentRegistry.profiles;
    assert.ok(profile);
    assert.equal(profile.id, "configured.claude_code");
    assert.equal(profile.runtime, "claude_code");
    assert.equal(profile.provider, "anthropic");
    assert.equal(profile.model, "enterprise-sonnet-alias");
    assert.equal(profile.effort, "low");
    assert.deepEqual(profile.capabilities, [
      "code_edit",
      "shell_exec",
      "test_execution",
    ]);
    assert.deepEqual(profile.permissions, [
      "read_only",
      "write_worktree",
      "shell_exec",
    ]);
    assert.deepEqual(profile.budget, {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: 1,
      maxRepairs: 1,
    });
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
