import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { describe, it } from "node:test";

describe("audit command", () => {
  it("prints a human audit report", () => {
    const output = execSync("pnpm exec tsx src/cli.ts audit", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.match(output, /Audit/);
    assert.match(output, /Summary/);
    assert.match(output, /Findings/);
    assert.match(output, /JSON-001/);
  });

  it("prints a json audit report", () => {
    const output = execSync("pnpm exec tsx src/cli.ts audit --json", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const json = JSON.parse(output) as {
      schemaVersion?: unknown;
      summary?: unknown;
      findings?: unknown;
    };

    assert.equal(json.schemaVersion, 1);
    assert.ok(json.summary);
    assert.ok(Array.isArray(json.findings));
  });
});
