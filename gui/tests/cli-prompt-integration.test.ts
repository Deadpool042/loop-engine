import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { DefaultLoopCliPromptClient } from "../main/cli-prompt-client.js";
import { NodeProcessRunner } from "../main/node-process-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoPath = resolve(__dirname, "..", "..");

describe("CLI prompt integration", () => {
  it("executes the real Loop Engine prompt JSON command for loop-engine", async () => {
    const client = new DefaultLoopCliPromptClient(new NodeProcessRunner());

    const report = await client.loadProjectPrompt(repoPath, "loop-engine");

    assert.equal(report.schemaVersion, 1);
    assert.equal(report.project.name, "loop-engine");
    assert.ok(Array.isArray(report.instructions));
    assert.ok(report.instructions.length > 0);
  });
});
