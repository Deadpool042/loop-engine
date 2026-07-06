import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { describe, it } from "node:test";

describe("handoff command", () => {
  it("prints a human handoff for a project", () => {
    const output = execSync("pnpm exec tsx src/cli.ts handoff loop-engine", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.match(output, /Handoff • loop-engine/);
    assert.match(output, /Project/);
    assert.match(output, /Roadmap/);
    assert.match(output, /Validation/);
    assert.match(output, /Instructions/);
  });
});
