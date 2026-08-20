import assert from "node:assert/strict";
import { test } from "node:test";
import { executionDecisionRenewalMessage } from "../../src/gui/desktop/app.js";
test("only renewable execution governance failures expose the decision renewal UX", () => {
  assert.match(executionDecisionRenewalMessage("decision_missing") ?? "", /Aucune décision/);
  assert.match(executionDecisionRenewalMessage("sha_stale") ?? "", /projet a changé/);
  assert.match(executionDecisionRenewalMessage("decision_revalidation_required") ?? "", /revue/);
  assert.match(executionDecisionRenewalMessage("candidate_authorization_mismatch") ?? "", /candidat/);
  assert.equal(executionDecisionRenewalMessage("decision_blocked"), null);
  assert.equal(executionDecisionRenewalMessage("decision_no_actionable_work"), null);
  assert.equal(executionDecisionRenewalMessage("unknown"), null);
});
