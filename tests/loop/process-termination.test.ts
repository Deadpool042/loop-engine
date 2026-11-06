import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { terminateProcessGroup } from "../../src/loop/process-termination.js";

type Signalled = { signal: NodeJS.Signals | 0 }[];

function fakeGroup(options: Readonly<{ dieOn: NodeJS.Signals | null }>) {
  const sent: Signalled = [];
  let alive = true;
  return {
    sent,
    deps: {
      signalGroup(_pgid: number, signal: NodeJS.Signals): boolean {
        sent.push({ signal });
        if (signal === options.dieOn) alive = false;
        return true;
      },
      isGroupAlive: (): boolean => alive,
      sleep: async (): Promise<void> => {
        await new Promise((resolve) => setImmediate(resolve));
      },
    },
  };
}

describe("terminateProcessGroup (L7)", () => {
  it("stops after SIGTERM when the group exits within the grace period", async () => {
    const group = fakeGroup({ dieOn: "SIGTERM" });
    const outcome = await terminateProcessGroup(4242, {
      killGraceMs: 50,
      confirmMs: 50,
      ...group.deps,
    });
    assert.equal(outcome, "terminated");
    assert.deepEqual(group.sent, [{ signal: "SIGTERM" }]);
  });

  it("escalates to SIGKILL when the group ignores SIGTERM", async () => {
    const group = fakeGroup({ dieOn: "SIGKILL" });
    const outcome = await terminateProcessGroup(4242, {
      killGraceMs: 20,
      confirmMs: 50,
      ...group.deps,
    });
    assert.equal(outcome, "terminated");
    assert.deepEqual(group.sent, [
      { signal: "SIGTERM" },
      { signal: "SIGKILL" },
    ]);
  });

  it("reports cleanup_failed instead of hiding a surviving group", async () => {
    const group = fakeGroup({ dieOn: null });
    const outcome = await terminateProcessGroup(4242, {
      killGraceMs: 20,
      confirmMs: 40,
      ...group.deps,
    });
    assert.equal(outcome, "cleanup_failed");
    assert.deepEqual(group.sent, [
      { signal: "SIGTERM" },
      { signal: "SIGKILL" },
    ]);
  });

  it("refuses an invalid group id without signalling anything", async () => {
    const group = fakeGroup({ dieOn: "SIGTERM" });
    for (const invalid of [0, -1, 1.5, Number.NaN]) {
      assert.equal(
        await terminateProcessGroup(invalid, {
          killGraceMs: 10,
          confirmMs: 10,
          ...group.deps,
        }),
        "cleanup_failed",
      );
    }
    assert.deepEqual(group.sent, []);
  });
});
