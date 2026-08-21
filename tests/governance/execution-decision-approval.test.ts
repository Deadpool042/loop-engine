import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExecutionDecisionFile } from "../../src/governance/execution-decision.js";
import { createExecutionDecisionDraftStore, prepareStoredExecutionDecisionDraft, serializeReadyExecutionDecision } from "../../src/governance/execution-decision-approval.js";
import { createExecutionDecisionDraft } from "../../src/governance/execution-decision-draft.js";
const local = { project: "lp", projectPath: "/tmp/lp", candidateId: "H4-L1", sourceDocument: "roadmap.md", gitHead: "a".repeat(40), executionDecisionPath: ".governance/execution-decision.yaml" }; const provider = { objective: "ADR", deliverables: ["doc"], outOfScope: ["exec"], allowedPaths: ["ADR/1.md"] };
test("stores an opaque draft without writing", () => { const store = createExecutionDecisionDraftStore(); const result = prepareStoredExecutionDecisionDraft(local, provider, store); assert.equal(result.ok, true); if (result.ok) { assert.equal(store.get(result.draftId)?.draft.candidateId, "H4-L1"); assert.doesNotMatch(result.draftId, /lp|H4|draft-1/); assert.equal(store.get("renderer-choice"), null); } });
test("replaces and consumes drafts per project", () => { const store = createExecutionDecisionDraftStore(); const first = prepareStoredExecutionDecisionDraft(local, provider, store); const second = prepareStoredExecutionDecisionDraft(local, provider, store); assert.equal(first.ok && second.ok, true); if (first.ok && second.ok) { assert.equal(store.get(first.draftId), null); store.consume(second.draftId); assert.equal(store.get(second.draftId), null); } });
test("serializes a locally READY V1 decision", () => { const store = createExecutionDecisionDraftStore(); const result = prepareStoredExecutionDecisionDraft(local, provider, store); assert.equal(result.ok, true); if (result.ok) { const parsed = parseExecutionDecisionFile(serializeReadyExecutionDecision(result.draft)); assert.equal(parsed.ok, true); if (parsed.ok) assert.equal(parsed.decision.decision.state, "READY"); } });
test("serializes the observed LP-INFRA H4-L1 draft", () => { const draft = { project: "lp-infra", candidateId: "H4-L1", sourceDocument: "docs/roadmap/projet-lp-infra.md", gitHead: "3b1767c897e53f38b6e8881116b8862cedf38503", objective: "Définir l’architecture du cockpit.", deliverables: ["ADR avec décisions d’architecture"], outOfScope: ["Aucune exécution ni modification d’infrastructure."], allowedPaths: ["ADR/0007-architecture-cockpit.md", "docs/roadmap/projet-lp-infra.md"] } as const; const parsed = parseExecutionDecisionFile(serializeReadyExecutionDecision(draft)); assert.equal(parsed.ok, true); if (parsed.ok) { assert.equal(parsed.decision.decision.state, "READY"); assert.equal(parsed.decision.decision.candidate.id, "H4-L1"); assert.equal(parsed.decision.source.gitHead, draft.gitHead); assert.deepEqual(parsed.decision.decision.candidate.allowedPaths, draft.allowedPaths); } });
test("serializes the full realistic H4-L1 ADR draft (apostrophes, colons, slashes and multi-item lists) without throwing", () => {
  const local = { project: "lp-infra", candidateId: "H4-L1", sourceDocument: "docs/roadmap/projet-lp-infra.md", gitHead: "3b1767c897e53f38b6e8881116b8862cedf38503", executionDecisionPath: ".governance/execution-decision.yaml" };
  const provider = {
    candidateId: "H4-L1",
    objective: "Rédiger l’ADR 0007 définissant l’architecture du cockpit : responsabilités, frontière de sécurité, modalités d’accès aux VPS/services, modèle read-only vs actions, et choix technologique minimal, sans aucune implémentation avant acceptation de l’ADR.",
    deliverables: [
      "créer `ADR/0007-architecture-cockpit.md` suivant le format ADR existant",
      "couvrir contexte, décision, responsabilités du cockpit, frontière de sécurité, modèle d’accès VPS/services, modèle read-only vs actions, choix technologique minimal, conséquences et alternatives",
      "mettre à jour `docs/roadmap/projet-lp-infra.md` pour refléter l’avancement de H4-L1",
    ],
    outOfScope: ["toute implémentation du cockpit", "modification d’autres ADR existants", "modification d’autres sections de roadmap hors H4-L1"],
    allowedPaths: ["ADR/0007-architecture-cockpit.md", "docs/roadmap/projet-lp-infra.md"],
  };
  const draftResult = createExecutionDecisionDraft(local, provider);
  assert.equal(draftResult.ok, true);
  if (!draftResult.ok) return;
  const yaml = serializeReadyExecutionDecision(draftResult.draft);
  const parsed = parseExecutionDecisionFile(yaml);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.decision.decision.state, "READY");
    assert.equal(parsed.decision.decision.candidate.id, "H4-L1");
    assert.equal(parsed.decision.decision.brief.objective, provider.objective);
    assert.deepEqual(parsed.decision.decision.brief.deliverables, provider.deliverables);
    assert.deepEqual(parsed.decision.decision.brief.outOfScope, provider.outOfScope);
  }
});
