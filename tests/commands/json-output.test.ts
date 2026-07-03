import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { describe, it } from "node:test";

function runJson(command: string): unknown {
  const output = execSync(command, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return JSON.parse(output) as unknown;
}

describe("json outputs", () => {
  it("summary --json exposes schemaVersion and projects", () => {
    const json = runJson("pnpm exec tsx src/cli.ts summary --json") as {
      schemaVersion?: unknown;
      projects?: unknown;
    };

    assert.equal(json.schemaVersion, 1);
    assert.ok(Array.isArray(json.projects));
  });

  it("context --json exposes schemaVersion and docs", () => {
    const json = runJson("pnpm exec tsx src/cli.ts context loop-engine --json") as {
      schemaVersion?: unknown;
      docs?: unknown;
    };

    assert.equal(json.schemaVersion, 1);
    assert.ok(json.docs);
  });

  it("next --json exposes schemaVersion and selected candidate field", () => {
    const json = runJson("pnpm exec tsx src/cli.ts next loop-engine --json") as {
      schemaVersion?: unknown;
      roadmap?: {
        selectedCandidate?: unknown;
      };
    };

    assert.equal(json.schemaVersion, 1);
    assert.ok(json.roadmap);
    assert.ok("selectedCandidate" in json.roadmap);
  });

  it("prompt --json exposes schemaVersion and instructions", () => {
    const json = runJson("pnpm exec tsx src/cli.ts prompt loop-engine --json") as {
      schemaVersion?: unknown;
      instructions?: unknown;
    };

    assert.equal(json.schemaVersion, 1);
    assert.ok(Array.isArray(json.instructions));
  });
});
