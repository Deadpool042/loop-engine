import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatPlanSteps,
  hasAddressableCandidate,
  isPlanForSelectedProject,
  parsePlanDetail,
  parsePlanFailure,
} from "../../src/gui/desktop/plan-contract.js";

describe("GUI explicit plan contract", () => {
  it("does not make plans available for a candidate without a stable ID and masks another project's plan", () => {
    assert.equal(hasAddressableCandidate({}), false);
    assert.equal(hasAddressableCandidate({ id: "H1-L4" }), true);
    assert.equal(isPlanForSelectedProject("lp-infra", "lp-infra"), true);
    assert.equal(isPlanForSelectedProject("lp-infra", "loop-engine"), false);
  });

  it("accepts only the successful plan fields rendered by the desktop cockpit", () => {
    assert.deepEqual(
      parsePlanDetail({
        schemaVersion: 1,
        project: "lp-infra",
        mode: "plan",
        status: "completed",
        candidate: {
          id: "H1-L4",
          text: "| H1-L4 | Runbook rollback (testé) | ⬜ À faire |",
          kind: "safe",
          status: "todo",
        },
        steps: [
          {
            name: "completed",
            details: [
              "Run local validation and audit before commit (validate, audit)",
            ],
          },
        ],
        agentPolicy: {
          selection: {
            outcome: "selected",
            profile: {
              id: "claude_code.low",
              provider: "anthropic",
              model: "claude-haiku-4-5",
              effort: "low",
            },
          },
          requirements: {
            category: "documentation",
            contextBudget: { maxEstimatedTokens: 5000 },
          },
          reasons: ["small bounded documentation lot"],
        },
        contextPackage: {
          files: [{ path: "docs/roadmap/projet-lp-infra.md" }],
          estimatedTokens: 2291,
          truncated: false,
        },
        writableFileScope: ["docs/roadmap/projet-lp-infra.md"],
        brief: {
          objective: "Documenter la stratégie de rollback.",
          deliverables: ["Runbook de rollback"],
          outOfScope: ["Déploiement en production"],
        },
        failure: null,
      }),
      {
        project: "lp-infra",
        candidate: {
          id: "H1-L4",
          text: "| H1-L4 | Runbook rollback (testé) | ⬜ À faire |",
          kind: "safe",
          status: "todo",
        },
        steps: [
          {
            name: "completed",
            details: [
              "Run local validation and audit before commit (validate, audit)",
            ],
          },
        ],
        profile: {
          id: "claude_code.low",
          provider: "anthropic",
          model: "claude-haiku-4-5",
          effort: "low",
          category: "documentation",
          reasons: ["small bounded documentation lot"],
          contextBudgetTokens: 5000,
          fallbackActive: false,
          fallbackReason: null,
        },
        context: {
          files: ["docs/roadmap/projet-lp-infra.md"],
          estimatedTokens: 2291,
          truncated: false,
        },
        writableFileScope: ["docs/roadmap/projet-lp-infra.md"],
        brief: {
          objective: "Documenter la stratégie de rollback.",
          deliverables: ["Runbook de rollback"],
          outOfScope: ["Déploiement en production"],
        },
      },
    );
  });

  it("renders known engine plan steps as French cockpit labels without exposing internal wording", () => {
    const plan = parsePlanDetail({
      schemaVersion: 1,
      project: "lp-infra",
      mode: "plan",
      status: "completed",
      candidate: {
        id: "H1-L4",
        text: "Runbook rollback (testé)",
        kind: "safe",
        status: "todo",
      },
      steps: [
        { name: "planning", details: ["Resolving project: lp-infra"] },
        {
          name: "ready",
          details: ["Selected candidate: Runbook rollback (testé)"],
        },
        {
          name: "completed",
          details: [
            "Select roadmap candidate: Runbook rollback (testé)",
            "Prepare short project context (context)",
            "Prepare delegation prompt (prompt)",
            "Await explicit agent execution in mode execute",
            "Run local validation and audit before commit (validate, audit)",
            "Commit only in mode commit",
            "Publish only in mode publish",
          ],
        },
      ],
      agentPolicy: null,
      contextPackage: null,
      writableFileScope: null,
      brief: null,
      failure: null,
    });

    assert.notEqual(plan, null);
    assert.deepEqual(formatPlanSteps(plan!), [
      "Résolution du projet : lp-infra",
      "Candidat confirmé : H1-L4 — Runbook rollback (testé)",
      "Sélection du candidat de roadmap : H1-L4 — Runbook rollback (testé)",
      "Préparation du contexte projet borné (context)",
      "Préparation du prompt de délégation (prompt)",
      "Attente d'une exécution explicite de l’agent en mode execute",
      "Validation et audit locaux avant commit (validate, audit)",
      "Commit uniquement en mode commit",
      "Publication uniquement en mode publish",
    ]);
  });

  it("rejects malformed successful plans and exposes a redacted fail-closed refusal", () => {
    assert.equal(
      parsePlanDetail({
        schemaVersion: 1,
        project: "lp-infra",
        mode: "plan",
        status: "completed",
        candidate: { id: "H1-L4" },
      }),
      null,
    );

    assert.deepEqual(
      parsePlanFailure({
        schemaVersion: 1,
        mode: "plan",
        status: "blocked",
        failure: {
          code: "candidate_done",
          message: "Roadmap candidate is already done: H1-L4",
        },
      }),
      {
        code: "candidate_done",
        message: "Roadmap candidate is already done: H1-L4",
      },
    );
  });
});
