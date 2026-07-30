import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createLoopApplicationAssembly,
  type LoopApplicationAssembly,
} from "../../src/composition/application-assembly.js";

describe("LoopApplicationAssembly", () => {
  it("returns the complete immutable application contract deterministically", () => {
    const first: LoopApplicationAssembly = createLoopApplicationAssembly();
    const second = createLoopApplicationAssembly();

    assert.equal(Object.isFrozen(first), true);
    assert.equal(first.loopExecutor, undefined);
    assert.equal(second.loopExecutor, undefined);
    assert.equal(first.loadConfig, second.loadConfig);
    assert.equal(first.runLoopPlan, second.runLoopPlan);
    assert.equal(first.runLoopExecute, second.runLoopExecute);
    assert.equal(first.runLoopCommit, second.runLoopCommit);
    assert.deepEqual(first.loopRunModes, second.loopRunModes);
  });

  it("constructs the Codex provider only inside the factory", () => {
    const application = createLoopApplicationAssembly({
      codexProvider: {
        executable: "/usr/local/bin/codex",
        model: "test-model",
        timeoutMs: 1_000,
      },
    });

    assert.equal(typeof application.loopExecutor, "function");
    assert.equal(Object.isFrozen(application), true);
  });

  it("preserves concrete provider validation", () => {
    assert.throws(
      () =>
        createLoopApplicationAssembly({
          codexProvider: { executable: "/usr/local/bin/not-codex" },
        }),
      /codex/i,
    );
  });
});
