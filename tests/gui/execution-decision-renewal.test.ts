import assert from "node:assert/strict";
import { test } from "node:test";
import { clearResolvedShaStalePlanError, executionDecisionRenewalMessage, shouldClearDraftOnApproveFailure } from "../../src/gui/desktop/app.js";
test("renewable execution governance failures and the deterministic serialize failure expose the decision renewal UX", () => {
  assert.match(executionDecisionRenewalMessage("decision_missing") ?? "", /Aucune décision/);
  assert.match(executionDecisionRenewalMessage("sha_stale") ?? "", /projet a changé/);
  assert.match(executionDecisionRenewalMessage("decision_revalidation_required") ?? "", /revue/);
  assert.match(executionDecisionRenewalMessage("candidate_authorization_mismatch") ?? "", /candidat/);
  assert.match(executionDecisionRenewalMessage("decision_draft_serialize_failed") ?? "", /sérialisé/);
  assert.equal(executionDecisionRenewalMessage("decision_blocked"), null);
  assert.equal(executionDecisionRenewalMessage("decision_no_actionable_work"), null);
  assert.equal(executionDecisionRenewalMessage("unknown"), null);
});
test("a successful renewed draft clears only the technical sha_stale banner", () => { assert.equal(clearResolvedShaStalePlanError("sha_stale: Le projet a changé"), null); assert.equal(clearResolvedShaStalePlanError("provider_timeout: indisponible"), "provider_timeout: indisponible"); assert.equal(clearResolvedShaStalePlanError(null), null); });
test("only deterministic approve failures (stale context or a draft that cannot be serialized) clear an already-displayed draft", () => {
  assert.equal(shouldClearDraftOnApproveFailure("decision_draft_stale"), true);
  assert.equal(shouldClearDraftOnApproveFailure("decision_draft_serialize_failed"), true);
  assert.equal(shouldClearDraftOnApproveFailure("decision_draft_write_failed"), false);
  assert.equal(shouldClearDraftOnApproveFailure("decision_draft_read_previous_failed"), false);
  assert.equal(shouldClearDraftOnApproveFailure("decision_draft_missing"), false);
  assert.equal(shouldClearDraftOnApproveFailure(undefined), false);
});
