import assert from "node:assert/strict";
import { test } from "node:test";
import { clearResolvedShaStalePlanError, executionDecisionRenewalMessage } from "../../src/gui/desktop/app.js";
test("only renewable execution governance failures expose the decision renewal UX", () => {
  assert.match(executionDecisionRenewalMessage("decision_missing") ?? "", /Aucune décision/);
  assert.match(executionDecisionRenewalMessage("sha_stale") ?? "", /projet a changé/);
  assert.match(executionDecisionRenewalMessage("decision_revalidation_required") ?? "", /revue/);
  assert.match(executionDecisionRenewalMessage("candidate_authorization_mismatch") ?? "", /candidat/);
  assert.equal(executionDecisionRenewalMessage("decision_blocked"), null);
  assert.equal(executionDecisionRenewalMessage("decision_no_actionable_work"), null);
  assert.equal(executionDecisionRenewalMessage("unknown"), null);
});
test("a successful renewed draft clears only the technical sha_stale banner", () => { assert.equal(clearResolvedShaStalePlanError("sha_stale: Le projet a changé", "sha_stale"), null); assert.equal(clearResolvedShaStalePlanError("provider_timeout: indisponible", "sha_stale"), "provider_timeout: indisponible"); assert.equal(clearResolvedShaStalePlanError("sha_stale: Le projet a changé", "decision_missing"), "sha_stale: Le projet a changé"); });
