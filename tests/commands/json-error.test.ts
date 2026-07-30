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
    const output = runFailingCommand(["context", "unknown-project", "--json"]);
    const json = JSON.parse(output) as {
      schemaVersion?: unknown;
      ok?: unknown;
      error?: { code?: unknown; message?: unknown };
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
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.schemaVersion, 1);
    assert.equal(json.ok, false);
    assert.equal(json.error?.code, "missing_project");
    assert.equal(json.error?.message, "Missing project argument for context");
  });

  it("returns a failed LoopRunResult when execute has no concrete executor", () => {
    const output = runFailingCommand([
      "run", "loop-engine", "--mode", "execute", "--json",
    ]);
    const json = JSON.parse(output) as {
      schemaVersion?: unknown;
      mode?: unknown;
      status?: unknown;
      failure?: { code?: unknown; message?: unknown };
      commit?: unknown;
      publication?: unknown;
    };
    assert.equal(json.schemaVersion, 1);
    assert.equal(json.mode, "execute");
    assert.equal(json.status, "failed");
    assert.equal(json.failure?.code, "executor_unavailable");
    assert.equal(json.commit, null);
    assert.equal(json.publication, null);
  });

  it("requires an explicit commit message for commit mode", () => {
    const output = runFailingCommand([
      "run", "loop-engine", "--mode", "commit", "--json",
    ]);
    const json = JSON.parse(output) as { error?: { code?: unknown } };
    assert.equal(json.error?.code, "missing_commit_message");
  });

  it("rejects mode publish for the run command", () => {
    const output = runFailingCommand([
      "run", "loop-engine", "--mode", "publish", "--json",
    ]);
    const json = JSON.parse(output) as { error?: { code?: unknown } };
    assert.equal(json.error?.code, "mode_not_implemented");
  });

  it("rejects an unrecognized --mode value distinctly from a known but unimplemented mode", () => {
    const output = runFailingCommand([
      "run", "loop-engine", "--mode", "banana", "--json",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "unknown_mode");
    assert.equal(json.error?.message, "Unknown loop run mode: banana");
  });

  it("rejects --mode with no value (--mode is the last argument)", () => {
    const output = runFailingCommand([
      "run", "loop-engine", "--json", "--mode",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "missing_mode_value");
    assert.equal(json.error?.message, "Missing value for --mode");
  });

  it("rejects --mode immediately followed by another flag", () => {
    const output = runFailingCommand([
      "run", "loop-engine", "--mode", "--json",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "missing_mode_value");
    assert.equal(json.error?.message, "Missing value for --mode");
  });

  it("rejects --max-repairs with no value", () => {
    const output = runFailingCommand([
      "run", "loop-engine", "--mode", "execute", "--json", "--max-repairs",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "missing_max_repairs_value");
    assert.equal(json.error?.message, "Missing value for --max-repairs");
  });

  it("rejects a negative --max-repairs value", () => {
    const output = runFailingCommand([
      "run", "loop-engine", "--mode", "execute", "--json", "--max-repairs", "-1",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "invalid_max_repairs");
    assert.equal(json.error?.message, "Invalid --max-repairs value: -1");
  });
});
