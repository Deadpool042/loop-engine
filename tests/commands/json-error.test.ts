import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

function runFailingCommand(args: string[]): string {
  try {
    return execFileSync("pnpm", ["exec", "tsx", "src/cli.ts", ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return String((error as { stdout?: unknown }).stdout ?? "");
  }
}

describe("json errors", () => {
  it("prints a json error for unknown project in json mode", () => {
    const output = runFailingCommand([
      "context",
      "unknown-project",
      "--json",
    ]);

    const json = JSON.parse(output) as {
      schemaVersion?: unknown;
      ok?: unknown;
      error?: {
        code?: unknown;
        message?: unknown;
      };
    };

    assert.equal(json.schemaVersion, 1);
    assert.equal(json.ok, false);
    assert.equal(json.error?.code, "unknown_project");
    assert.equal(json.error?.message, "Unknown project: unknown-project");
  });

  it("prints a json error for missing project in json mode", () => {
    const output = runFailingCommand(["context", "--json"]);

    const json = JSON.parse(output) as {
      schemaVersion?: unknown;
      ok?: unknown;
      error?: {
        code?: unknown;
        message?: unknown;
      };
    };

    assert.equal(json.schemaVersion, 1);
    assert.equal(json.ok, false);
    assert.equal(json.error?.code, "missing_project");
    assert.equal(json.error?.message, "Missing project argument for context");
  });
});
