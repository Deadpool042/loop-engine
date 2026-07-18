import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isExecutionTransitionAllowed } from "../../src/executor/state-machine.js";

describe("Execution state machine", () => {
  it("allows created -> prepared", () => {
    assert.equal(isExecutionTransitionAllowed("created", "prepared"), true);
  });

  it("rejects prepared -> created", () => {
    assert.equal(isExecutionTransitionAllowed("prepared", "created"), false);
  });

  it("rejects prepared -> prepared", () => {
    assert.equal(isExecutionTransitionAllowed("prepared", "prepared"), false);
  });
});
