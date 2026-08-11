import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "..", "..");
const tsxExecutable = resolve(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const cliPath = resolve(repoRoot, "src", "cli.ts");

function runFailingCommand(args: string[], cwd = repoRoot): string {
  try {
    return execFileSync(tsxExecutable, [cliPath, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return String((error as { stdout?: unknown }).stdout ?? "");
  }
}

function setupRunnableProject(): {
  cwd: string;
  projectName: string;
  cleanup: () => void;
} {
  const cwd = mkdtempSync(join(tmpdir(), "loop-json-error-"));
  const projectName = "run-fixture";

  writeFileSync(
    join(cwd, "projects.yaml"),
    [
      "projects:",
      `  - name: ${projectName}`,
      "    path: .",
      "    type: test",
      "    required_docs: []",
      "    validation: []",
      "    roadmap:",
      "      - roadmap.md",
      "",
    ].join("\n"),
  );
  writeFileSync(join(cwd, "roadmap.md"), "- [ ] Exercise executor boundary\n");

  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  execFileSync("git", ["add", "projects.yaml", "roadmap.md"], { cwd });
  execFileSync("git", ["commit", "-q", "-m", "fixture baseline"], { cwd });

  return {
    cwd,
    projectName,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
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
    const fixture = setupRunnableProject();
    try {
      const output = runFailingCommand(
        ["run", fixture.projectName, "--mode", "execute", "--json"],
        fixture.cwd,
      );
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
    } finally {
      fixture.cleanup();
    }
  });

  it("requires an explicit commit message for commit mode", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--mode",
      "commit",
      "--json",
    ]);
    const json = JSON.parse(output) as { error?: { code?: unknown } };
    assert.equal(json.error?.code, "missing_commit_message");
  });

  it("rejects mode publish for the run command", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--mode",
      "publish",
      "--json",
    ]);
    const json = JSON.parse(output) as { error?: { code?: unknown } };
    assert.equal(json.error?.code, "mode_not_implemented");
  });

  it("rejects publish before attempting provider assembly", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--mode",
      "publish",
      "--provider",
      "codex",
      "--provider-executable",
      "/usr/local/bin/not-codex",
      "--json",
    ]);
    const json = JSON.parse(output) as { error?: { code?: unknown } };
    assert.equal(json.error?.code, "mode_not_implemented");
  });

  it("rejects an unrecognized --mode value distinctly from a known but unimplemented mode", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--mode",
      "banana",
      "--json",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "unknown_mode");
    assert.equal(json.error?.message, "Unknown loop run mode: banana");
  });

  it("rejects --mode with no value (--mode is the last argument)", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--json",
      "--mode",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "missing_mode_value");
    assert.equal(json.error?.message, "Missing value for --mode");
  });

  it("rejects --mode immediately followed by another flag", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--mode",
      "--json",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "missing_mode_value");
    assert.equal(json.error?.message, "Missing value for --mode");
  });

  it("rejects --max-repairs with no value", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--mode",
      "execute",
      "--json",
      "--max-repairs",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "missing_max_repairs_value");
    assert.equal(json.error?.message, "Missing value for --max-repairs");
  });

  it("rejects a negative --max-repairs value", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--mode",
      "execute",
      "--json",
      "--max-repairs",
      "-1",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "invalid_max_repairs");
    assert.equal(json.error?.message, "Invalid --max-repairs value: -1");
  });

  it("requires a value for --export-patch", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--mode",
      "execute",
      "--json",
      "--export-patch",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "missing_export_patch_value");
    assert.equal(json.error?.message, "Missing value for --export-patch");
  });

  for (const mode of ["plan", "commit", "publish"] as const) {
    it(`rejects --export-patch in ${mode} mode`, () => {
      const output = runFailingCommand([
        "run",
        "loop-engine",
        "--mode",
        mode,
        "--export-patch",
        "./validated.patch",
        "--json",
      ]);
      const json = JSON.parse(output) as {
        error?: { code?: unknown; message?: unknown };
      };
      assert.equal(json.error?.code, "export_patch_execute_only");
      assert.equal(
        json.error?.message,
        "--export-patch is only supported in execute mode.",
      );
    });
  }

  it("requires an explicit provider for --export-patch", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--mode",
      "execute",
      "--export-patch",
      "./validated.patch",
      "--json",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "export_patch_requires_provider");
    assert.equal(
      json.error?.message,
      "--export-patch requires an explicit provider.",
    );
  });

  it("requires a Claude Code executable when the provider is selected", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--mode",
      "execute",
      "--provider",
      "claude_code",
      "--json",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "missing_provider_executable");
    assert.equal(
      json.error?.message,
      "Claude Code provider requires --provider-executable.",
    );
  });

  it("rejects a Claude Code executable with the wrong command name", () => {
    const output = runFailingCommand([
      "run",
      "loop-engine",
      "--mode",
      "execute",
      "--provider",
      "claude_code",
      "--provider-executable",
      "/usr/local/bin/not-claude",
      "--json",
    ]);
    const json = JSON.parse(output) as {
      error?: { code?: unknown; message?: unknown };
    };
    assert.equal(json.error?.code, "invalid_provider_executable");
    assert.equal(
      json.error?.message,
      "Claude Code provider executable must resolve to a command named claude.",
    );
  });

  it("wires Claude Code through the CLI and reaches the concrete executor boundary", () => {
    const fixture = setupRunnableProject();
    try {
      const output = runFailingCommand(
        [
          "run",
          fixture.projectName,
          "--mode",
          "execute",
          "--provider",
          "claude_code",
          "--provider-executable",
          "/definitely-missing/claude",
          "--json",
        ],
        fixture.cwd,
      );
      const json = JSON.parse(output) as {
        mode?: unknown;
        status?: unknown;
        failure?: { code?: unknown };
        agentPolicy?: { selection?: { profile?: { runtime?: unknown } } };
      };
      assert.equal(json.mode, "execute");
      assert.equal(json.status, "failed");
      assert.equal(
        ["provider_unavailable", "worktree_not_clean"].includes(
          String(json.failure?.code),
        ),
        true,
      );
      assert.equal(
        json.agentPolicy?.selection?.profile?.runtime,
        "claude_code",
      );
    } finally {
      fixture.cleanup();
    }
  });
});
