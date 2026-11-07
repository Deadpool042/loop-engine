import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { createAgentRegistry } from "../../src/agents/registry.js";
import type { AgentProfile } from "../../src/agents/types.js";
import { runLoopExecute } from "../../src/loop/execute-runner.js";
import type { LoopExecutor, LoopValidator } from "../../src/loop/execution.js";
import { DEFAULT_AGENT_POLICY } from "../../src/policy/defaults.js";
import { createRunnerFixture } from "./support/runner-fixture.js";

// Couverture d'annulation des sites d'appel de l'exécuteur de execute-runner.ts.
// Le fichier compte aujourd'hui CINQ sites (exécution initiale, deux escalades de
// modèle, réparation de complétion, réparation pilotée par l'exécuteur) ; la
// règle AUDIT-495 en tolère entre 1 et 5. CLAUDE.md décrit « un seul site » :
// cette formulation ne correspond ni au code ni à l'audit (voir le document
// d'architecture). Les tests ci-dessous interdisent un sixième site et exigent
// qu'aucun site ne soit appelé sans contrôle d'annulation ni contexte.

function profile(
  id: string,
  model: string,
  economicTier: AgentProfile["economicTier"],
): AgentProfile {
  return {
    id,
    runtime: "codex",
    provider: "openai",
    model,
    effort: economicTier === "economy" ? "low" : "medium",
    economicTier,
    availability: "available",
    capabilities: ["code_edit", "shell_exec", "test_execution"],
    permissions: ["read_only", "write_worktree", "shell_exec"],
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: 300_000,
      maxCalls: 1,
      maxRepairs: 1,
    },
  };
}

const registry = () =>
  createAgentRegistry([
    profile("codex.economy", "luna", "economy"),
    profile("codex.standard", "terra", "standard"),
  ]);

const maxTurns = {
  status: "failed" as const,
  modifiedFiles: ["src/feature.ts"] as readonly string[],
  failure: {
    code: "provider_max_turns",
    message: "The economic model exhausted its turn budget.",
    details: [] as string[],
  },
};
const done = {
  status: "completed" as const,
  modifiedFiles: ["src/feature.ts"] as readonly string[],
  details: ["synthetic"],
};
const passing: LoopValidator = async () => ({
  status: "passed",
  failedCommand: null,
  exitCode: 0,
  details: ["passed"],
});

function options(extra: Record<string, unknown>, signal: AbortSignal) {
  const fixture = createRunnerFixture();
  return {
    ...fixture.options,
    agentPolicy: DEFAULT_AGENT_POLICY,
    agentRegistry: registry(),
    readModifiedWorktreeFiles: async () =>
      ["src/feature.ts"] as readonly string[],
    signal,
    ...extra,
  };
}

describe("sites d'appel de l'exécuteur — escalade de modèle sous annulation", () => {
  it("E1 — annulation pendant l'appel de l'exécuteur escaladé : cancelled, aucune validation", async () => {
    const controller = new AbortController();
    let calls = 0;
    let validations = 0;
    const result = await runLoopExecute(
      "cancellation-fixture",
      options(
        {
          executor: (async () => {
            calls += 1;
            if (calls === 1) return maxTurns;
            controller.abort();
            return done;
          }) satisfies LoopExecutor,
          validator: (async (input) => {
            validations += 1;
            return passing(input);
          }) satisfies LoopValidator,
        },
        controller.signal,
      ),
    );
    assert.equal(result.status, "cancelled");
    assert.equal(calls, 2);
    assert.equal(validations, 0);
  });

  it("E2 — annulation observée avant l'escalade : l'exécuteur escaladé n'est jamais appelé", async () => {
    const controller = new AbortController();
    let calls = 0;
    const result = await runLoopExecute(
      "cancellation-fixture",
      options(
        {
          executor: (async () => {
            calls += 1;
            controller.abort();
            return maxTurns;
          }) satisfies LoopExecutor,
          validator: passing,
        },
        controller.signal,
      ),
    );
    assert.equal(result.status, "cancelled");
    assert.equal(calls, 1);
  });

  it("E3 — escalade déclenchée par une validation en échec : annulation pendant l'appel escaladé", async () => {
    const controller = new AbortController();
    let calls = 0;
    let validations = 0;
    const result = await runLoopExecute(
      "cancellation-fixture",
      options(
        {
          maxRepairs: 0,
          executor: (async () => {
            calls += 1;
            if (calls === 2) controller.abort();
            return done;
          }) satisfies LoopExecutor,
          validator: (async () => {
            validations += 1;
            return {
              status: "failed" as const,
              failedCommand: "fixture-validation",
              exitCode: 1,
              details: ["failed"],
            };
          }) satisfies LoopValidator,
        },
        controller.signal,
      ),
    );
    assert.equal(result.status, "cancelled");
    assert.equal(calls, 2);
    assert.equal(validations, 1, "aucune revalidation après l'annulation");
  });

  it("E4 — annulation pendant une validation en échec : aucune escalade, aucun nouvel appel", async () => {
    const controller = new AbortController();
    let calls = 0;
    const result = await runLoopExecute(
      "cancellation-fixture",
      options(
        {
          maxRepairs: 0,
          executor: (async () => {
            calls += 1;
            return done;
          }) satisfies LoopExecutor,
          validator: (async () => {
            controller.abort();
            return {
              status: "failed" as const,
              failedCommand: "fixture-validation",
              exitCode: 1,
              details: ["failed"],
            };
          }) satisfies LoopValidator,
        },
        controller.signal,
      ),
    );
    assert.equal(result.status, "cancelled");
    assert.equal(calls, 1);
  });
});

describe("sites d'appel de l'exécuteur — garde structurelle de execute-runner.ts", () => {
  const source = readFileSync(
    join(import.meta.dirname, "..", "..", "src", "loop", "execute-runner.ts"),
    "utf8",
  );
  const lines = source.split("\n");
  const sites = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.includes("dependencies.executor("));

  it("S1 — exactement cinq sites d'appel : un sixième exige une décision explicite", () => {
    assert.equal(sites.length, 5);
  });

  it("S2 — chaque site transmet le contexte d'annulation de l'exécuteur", () => {
    for (const { index } of sites) {
      const call = lines.slice(index, index + 5).join("\n");
      assert.match(call, /executorContext/, `site ligne ${index + 1}`);
    }
  });

  it("S3 — chaque site est précédé d'un contrôle d'annulation et suivi d'un contrôle après appel", () => {
    for (const { index } of sites) {
      const before = lines.slice(Math.max(0, index - 60), index).join("\n");
      assert.match(
        before,
        /observeCancellation\(/,
        `avant, ligne ${index + 1}`,
      );
      const after = lines.slice(index, index + 40).join("\n");
      assert.match(
        after,
        /observeCancellation\([\s\S]*observeCancellation\(/,
        `catch puis après appel, ligne ${index + 1}`,
      );
    }
  });
});
