import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { DefaultLoopCliContextClient } from "../main/cli-context-client.js";
import { NodeProcessRunner } from "../main/node-process-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoPath = resolve(__dirname, "..", "..");

describe("CLI context integration", () => {
  it("executes the real Loop Engine context JSON command for loop-engine", async () => {
    const client = new DefaultLoopCliContextClient(new NodeProcessRunner());

    const report = await client.loadProjectContext(repoPath, "loop-engine");

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.project.name, "loop-engine");
    assert.equal(typeof report.health, "string");
  });
});
