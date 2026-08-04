import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { DefaultLoopCliSummaryClient } from "../main/cli-summary-client.js";
import { NodeProcessRunner } from "../main/node-process-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoPath = resolve(__dirname, "..", "..");

describe("CLI summary integration", () => {
  it("executes the real Loop Engine summary JSON command", async () => {
    const client = new DefaultLoopCliSummaryClient(
      new NodeProcessRunner(),
    );

    const summary = await client.loadWorkspaceSummary(repoPath);

    assert.equal(summary.schemaVersion, 1);
    assert.ok(Array.isArray(summary.projects));
  });
});
