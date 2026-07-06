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

  it("prints json handoff when requested", () => {
    const output = execSync("pnpm exec tsx src/cli.ts handoff loop-engine --json", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const json = JSON.parse(output) as {
      schemaVersion?: unknown;
      project?: { name?: unknown };
      roadmap?: unknown;
      instructions?: unknown;
    };

    assert.equal(json.schemaVersion, 1);
    assert.equal(json.project?.name, "loop-engine");
    assert.ok(json.roadmap);
    assert.ok(Array.isArray(json.instructions));
  });
});
