import * as assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGuidedFlowSteps,
  getFocusedGuidedFlowStepId,
} from "../../src/gui/desktop/guided-flow.js";

test("starts on project selection when no project is selected", () => {
  assert.deepEqual(
    buildGuidedFlowSteps({
      hasProject: false,
      contextLoading: false,
      hasCandidate: false,
      candidateAddressable: false,
      planLoading: false,
      hasPlan: false,
      hasPlanError: false,
      hasExecutionOutcome: false,
    }).map((step) => [step.id, step.status]),
    [
      ["project", "active"],
      ["work", "pending"],
      ["prepare", "pending"],
      ["execute", "pending"],
      ["result", "pending"],
    ],
  );
});

test("keeps work active while an addressable candidate awaits confirmation", () => {
  const steps = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: true,
    planLoading: false,
    hasPlan: false,
    hasPlanError: false,
    hasExecutionOutcome: false,
  });

  assert.equal(steps.find((step) => step.id === "work")?.status, "active");
  assert.equal(steps.find((step) => step.id === "prepare")?.status, "pending");
  assert.equal(getFocusedGuidedFlowStepId(steps), "work");
});

test("focuses preparation while the confirmed work is being prepared", () => {
  const steps = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: true,
    planLoading: true,
    hasPlan: false,
    hasPlanError: false,
    hasExecutionOutcome: false,
  });

  assert.equal(steps.find((step) => step.id === "work")?.status, "done");
  assert.equal(steps.find((step) => step.id === "prepare")?.status, "active");
  assert.equal(getFocusedGuidedFlowStepId(steps), "prepare");
});

test("keeps preparation focused and blocked when plan preparation fails", () => {
  const steps = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: true,
    planLoading: false,
    hasPlan: false,
    hasPlanError: true,
    hasExecutionOutcome: false,
  });

  assert.equal(steps.find((step) => step.id === "work")?.status, "done");
  assert.equal(steps.find((step) => step.id === "prepare")?.status, "blocked");
  assert.equal(getFocusedGuidedFlowStepId(steps), "prepare");
});

test("advances from a prepared plan to execution and result", () => {
  const execute = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: true,
    planLoading: false,
    hasPlan: true,
    hasPlanError: false,
    hasExecutionOutcome: false,
  });
  assert.equal(execute.find((step) => step.id === "execute")?.status, "active");

  const result = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: true,
    planLoading: false,
    hasPlan: true,
    hasPlanError: false,
    hasExecutionOutcome: true,
  });
  assert.equal(result.find((step) => step.id === "result")?.status, "active");
  assert.equal(result.find((step) => step.id === "execute")?.status, "done");
});

test("keeps preparation focused while an execution-decision draft is pending, even after the plan error clears", () => {
  const steps = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: true,
    planLoading: false,
    hasPlan: false,
    hasPlanError: false,
    hasExecutionOutcome: false,
    hasExecutionDecisionInProgress: true,
  });

  assert.equal(steps.find((step) => step.id === "work")?.status, "done");
  assert.equal(steps.find((step) => step.id === "prepare")?.status, "blocked");
  assert.equal(getFocusedGuidedFlowStepId(steps), "prepare");
});

test("marks work as blocked when the candidate cannot be addressed", () => {
  const steps = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: false,
    planLoading: false,
    hasPlan: false,
    hasPlanError: false,
    hasExecutionOutcome: false,
  });

  assert.equal(steps.find((step) => step.id === "work")?.status, "blocked");
  assert.equal(steps.find((step) => step.id === "prepare")?.status, "pending");
  assert.equal(getFocusedGuidedFlowStepId(steps), "work");
});
