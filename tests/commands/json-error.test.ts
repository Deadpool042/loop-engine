import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";

describe("json errors", () => {
  it("prints a json error for unknown project in json mode", () => {
    let output = "";

    try {
      output = execFileSync(
        "pnpm",
        ["exec", "tsx", "src/cli.ts", "context", "unknown-project", "--json"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      output = String((error as { stdout?: unknown }).stdout ?? "");
    }

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
  
  it("prints a json error for missing project in json mode", () => {
    let output = "";

    try {
      output = execFileSync(
        "pnpm",
        ["exec", "tsx", "src/cli.ts", "context", "--json"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      output = String((error as { stdout?: unknown }).stdout ?? "");
    }

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

  it("prints a json error for missing project in json mode", () => {
    let output = "";

    try {
      output = execFileSync(
        "pnpm",
        ["exec", "tsx", "src/cli.ts", "context", "--json"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      output = String((error as { stdout?: unknown }).stdout ?? "");
    }

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
