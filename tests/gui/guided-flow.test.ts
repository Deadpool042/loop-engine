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
      hasPlan: false,
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

test("advances through work, preparation, execution, and result", () => {
  const work = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: true,
    hasPlan: false,
    hasExecutionOutcome: false,
  });
  assert.equal(work.find((step) => step.id === "prepare")?.status, "active");

  const execute = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: true,
    hasPlan: true,
    hasExecutionOutcome: false,
  });
  assert.equal(execute.find((step) => step.id === "execute")?.status, "active");

  const result = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: true,
    hasPlan: true,
    hasExecutionOutcome: true,
  });
  assert.equal(result.find((step) => step.id === "result")?.status, "active");
  assert.equal(result.find((step) => step.id === "execute")?.status, "done");
});

test("marks work as blocked when the candidate cannot be addressed", () => {
  const steps = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: false,
    hasPlan: false,
    hasExecutionOutcome: false,
  });

  assert.equal(steps.find((step) => step.id === "work")?.status, "blocked");
  assert.equal(steps.find((step) => step.id === "prepare")?.status, "pending");
  assert.equal(getFocusedGuidedFlowStepId(steps), "work");
});

test("focuses the active step before any pending step", () => {
  const steps = buildGuidedFlowSteps({
    hasProject: true,
    contextLoading: false,
    hasCandidate: true,
    candidateAddressable: true,
    hasPlan: true,
    hasExecutionOutcome: false,
  });

  assert.equal(getFocusedGuidedFlowStepId(steps), "execute");
});
