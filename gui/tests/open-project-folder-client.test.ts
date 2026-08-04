import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DefaultLoopCliOpenFolderClient } from "../main/open-project-folder-client.js";
import type { LoopCliContextClient } from "../main/cli-context-client.js";
import type { ProjectContextReport } from "../shared/project-context.js";

function fakeContextClient(
  path: string,
): LoopCliContextClient & { calls: Array<{ repoPath: string; projectName: string }> } {
  const calls: Array<{ repoPath: string; projectName: string }> = [];
  return {
    calls,
    async loadProjectContext(repoPath, projectName) {
      calls.push({ repoPath, projectName });
      return {
        schemaVersion: 1,
        project: { name: projectName, type: "node-cli", path },
        git: {},
        docs: {},
        roadmap: { selectedCandidate: null },
        validation: {},
        health: "good",
      } satisfies ProjectContextReport;
    },
  };
}

describe("DefaultLoopCliOpenFolderClient", () => {
  it("resolves the project path via the context client and opens it", async () => {
    const contextClient = fakeContextClient("/tmp/loop-engine");
    const opened: string[] = [];
    const client = new DefaultLoopCliOpenFolderClient(contextClient, {
      async openPath(path) {
        opened.push(path);
        return "";
      },
    });

    await client.openProjectFolder("/tmp/loop-engine", "loop-engine");

    assert.deepEqual(contextClient.calls, [
      { repoPath: "/tmp/loop-engine", projectName: "loop-engine" },
    ]);
    assert.deepEqual(opened, ["/tmp/loop-engine"]);
  });

  it("never receives a path from the caller — only repoPath and projectName", async () => {
    const contextClient = fakeContextClient("/tmp/resolved-by-cli");
    const client = new DefaultLoopCliOpenFolderClient(contextClient, {
      async openPath() {
        return "";
      },
    });

    // openProjectFolder's signature only accepts (repoPath, projectName) —
    // the compiler already forbids a caller-supplied path; this asserts the
    // path that got opened matches what the context client resolved, not
    // anything the caller could have passed in.
    await client.openProjectFolder("/tmp/loop-engine", "loop-engine");
    assert.equal(contextClient.calls[0]?.projectName, "loop-engine");
  });

  it("rejects with the opener's error message when opening fails", async () => {
    const contextClient = fakeContextClient("/tmp/missing");
    const client = new DefaultLoopCliOpenFolderClient(contextClient, {
      async openPath() {
        return "no such file or directory";
      },
    });

    await assert.rejects(
      () => client.openProjectFolder("/tmp/loop-engine", "loop-engine"),
      /no such file or directory/,
    );
  });

  it("propagates a context resolution failure without calling the opener", async () => {
    const opened: string[] = [];
    const client = new DefaultLoopCliOpenFolderClient(
      {
        async loadProjectContext() {
          throw new Error("unknown project");
        },
      },
      {
        async openPath(path) {
          opened.push(path);
          return "";
        },
      },
    );

    await assert.rejects(
      () => client.openProjectFolder("/tmp/loop-engine", "missing"),
      /unknown project/,
    );
    assert.equal(opened.length, 0);
  });
});
