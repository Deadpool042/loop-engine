import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSectionLoader } from "../renderer/section-loader.js";
import { encodeGuiExecutionError } from "../shared/gui-execution-error.js";

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("createSectionLoader", () => {
  it("starts in the loading state and resolves to success", async () => {
    let resolveFetch!: (value: { data: string }) => void;
    const settled: string[] = [];

    const loader = createSectionLoader<{ data: string }>({
      fetch: () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
      onSettled: (projectName) => settled.push(projectName),
    });

    loader.load("loop-engine", false);
    assert.deepEqual(loader.stateByProject.get("loop-engine"), {
      status: "loading",
    });

    resolveFetch({ data: "hello" });
    await flush();

    assert.deepEqual(loader.stateByProject.get("loop-engine"), {
      status: "success",
      value: { data: "hello" },
    });
    assert.deepEqual(settled, ["loop-engine"]);
  });

  it("coalesces concurrent load calls for the same project into a single fetch", async () => {
    let calls = 0;
    let resolveFetch!: (value: string) => void;

    const loader = createSectionLoader<string>({
      fetch: () => {
        calls += 1;
        return new Promise((resolve) => {
          resolveFetch = resolve;
        });
      },
      onSettled: () => {
        /* noop */
      },
    });

    loader.load("loop-engine", false);
    loader.load("loop-engine", false);

    resolveFetch("value");
    await flush();

    assert.equal(calls, 1);
  });

  it("stores a classified GuiExecutionError and does not throw", async () => {
    const loader = createSectionLoader<string>({
      fetch: () => Promise.reject(new Error("boom")),
      onSettled: () => {
        /* noop */
      },
    });

    loader.load("loop-engine", false);
    await flush();

    const state = loader.stateByProject.get("loop-engine");

    assert.equal(state?.status, "error");
    if (state?.status === "error") {
      assert.equal(state.error.kind, "invalid_output");
      assert.equal(state.error.details, "boom");
    }
  });

  it("recovers the structured GuiExecutionError from an encoded IPC rejection", async () => {
    const loader = createSectionLoader<string>({
      fetch: () =>
        Promise.reject(
          new Error(
            encodeGuiExecutionError({
              kind: "process_exit_failed",
              message: "La commande a échoué.",
              details: "unknown project",
              exitCode: 1,
            }),
          ),
        ),
      onSettled: () => {
        /* noop */
      },
    });

    loader.load("loop-engine", false);
    await flush();

    const state = loader.stateByProject.get("loop-engine");

    assert.equal(state?.status, "error");
    if (state?.status === "error" && state.error.kind === "process_exit_failed") {
      assert.equal(state.error.exitCode, 1);
      assert.equal(state.error.details, "unknown project");
    } else {
      assert.fail("expected a decoded process_exit_failed error");
    }
  });

  it("does not permanently block a retry after an error: a later load call re-fetches", async () => {
    let calls = 0;

    const loader = createSectionLoader<string>({
      fetch: () => {
        calls += 1;
        return calls === 1
          ? Promise.reject(new Error("boom"))
          : Promise.resolve("recovered");
      },
      onSettled: () => {
        /* noop */
      },
    });

    loader.load("loop-engine", false);
    await flush();

    loader.stateByProject.delete("loop-engine");
    loader.load("loop-engine", true);
    await flush();

    assert.equal(calls, 2);
    assert.deepEqual(loader.stateByProject.get("loop-engine"), {
      status: "success",
      value: "recovered",
    });
  });

  it("forwards the refresh flag to fetch", async () => {
    const refreshFlags: boolean[] = [];

    const loader = createSectionLoader<string>({
      fetch: (_projectName, refresh) => {
        refreshFlags.push(refresh);
        return Promise.resolve("value");
      },
      onSettled: () => {
        /* noop */
      },
    });

    loader.load("loop-engine", false);
    await flush();
    loader.load("loop-engine", true);
    await flush();

    assert.deepEqual(refreshFlags, [false, true]);
  });

  it("keeps state independent per project", async () => {
    const loader = createSectionLoader<string>({
      fetch: (projectName) => Promise.resolve(`value:${projectName}`),
      onSettled: () => {
        /* noop */
      },
    });

    loader.load("creatyss", false);
    loader.load("n8n", false);
    await flush();

    assert.deepEqual(loader.stateByProject.get("creatyss"), {
      status: "success",
      value: "value:creatyss",
    });
    assert.deepEqual(loader.stateByProject.get("n8n"), {
      status: "success",
      value: "value:n8n",
    });
  });

  it("keeps two distinct loader instances (e.g. context vs prompt) from contaminating each other", async () => {
    const contextLoader = createSectionLoader<string>({
      fetch: () => Promise.resolve("context-value"),
      onSettled: () => {
        /* noop */
      },
    });
    const promptLoader = createSectionLoader<string>({
      fetch: () => Promise.resolve("prompt-value"),
      onSettled: () => {
        /* noop */
      },
    });

    contextLoader.load("loop-engine", false);
    await flush();

    assert.deepEqual(contextLoader.stateByProject.get("loop-engine"), {
      status: "success",
      value: "context-value",
    });
    assert.equal(promptLoader.stateByProject.has("loop-engine"), false);
    assert.notEqual(contextLoader.stateByProject, promptLoader.stateByProject);

    promptLoader.load("loop-engine", false);
    await flush();

    assert.deepEqual(contextLoader.stateByProject.get("loop-engine"), {
      status: "success",
      value: "context-value",
    });
    assert.deepEqual(promptLoader.stateByProject.get("loop-engine"), {
      status: "success",
      value: "prompt-value",
    });
  });
});
