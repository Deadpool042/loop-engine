import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "..", "..");
const cliPath = resolve(repoRoot, "src", "cli.ts");
const tsxPath = resolve(repoRoot, "node_modules", ".bin", "tsx");

function setupFixture(): Readonly<{
  root: string;
  projectPath: string;
  missingClaude: string;
  missingCodex: string;
  cleanup: () => void;
}> {
  const root = mkdtempSync(join(tmpdir(), "loop-run-provider-failover-"));
  const projectPath = join(root, "example");
  mkdirSync(projectPath, { recursive: true });

  writeFileSync(
    join(root, "projects.yaml"),
    [
      "projects:",
      "  - name: example",
      "    path: ./example",
      "    type: fixture",
      "    workspace:",
      "      mode: permanent",
      "      dependencies: none",
      "    required_docs: []",
      "    validation: []",
      "    roadmap:",
      "      - roadmap.md",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(projectPath, "roadmap.md"),
    "- [ ] [P1] V1.0 — Qualify explicit provider failover\n",
  );

  execFileSync("git", ["init", "-q"], { cwd: projectPath });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: projectPath,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: projectPath });
  execFileSync("git", ["add", "roadmap.md"], { cwd: projectPath });
  execFileSync("git", ["commit", "-q", "-m", "test: baseline"], {
    cwd: projectPath,
  });

  return {
    root,
    projectPath,
    missingClaude: join(root, "missing", "claude"),
    missingCodex: join(root, "missing", "codex"),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("loop run exposes bounded explicit provider failover through the existing composition", () => {
  const fixture = setupFixture();
  try {
    const result = spawnSync(
      tsxPath,
      [
        cliPath,
        "run",
        "example",
        "--mode",
        "execute",
        "--candidate",
        "V1.0",
        "--provider",
        "claude_code",
        "--provider-executable",
        fixture.missingClaude,
        "--provider-model",
        "claude-haiku-4-5",
        "--provider-timeout-ms",
        "1000",
        "--fallback-provider",
        "codex",
        "--fallback-provider-executable",
        fixture.missingCodex,
        "--fallback-provider-model",
        "gpt-5.6-luna",
        "--fallback-provider-timeout-ms",
        "1000",
        "--json",
      ],
      {
        cwd: fixture.root,
        encoding: "utf8",
        timeout: 20_000,
      },
    );

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout) as {
      status?: string;
      failure?: { code?: string };
      providerFailoverEvidence?: {
        maxAttempts?: number;
        attemptedProviders?: string[];
        selectedProvider?: string | null;
        attempts?: Array<{
          attempt?: number;
          provider?: string;
          failureCode?: string | null;
          recoverable?: boolean;
        }>;
      };
    };

    assert.equal(report.status, "failed");
    assert.equal(report.failure?.code, "provider_failed");
    assert.equal(report.providerFailoverEvidence?.maxAttempts, 2);
    assert.deepEqual(report.providerFailoverEvidence?.attemptedProviders, [
      "anthropic",
      "openai",
    ]);
    assert.equal(report.providerFailoverEvidence?.selectedProvider, null);
    assert.deepEqual(
      report.providerFailoverEvidence?.attempts?.map((attempt) => ({
        attempt: attempt.attempt,
        provider: attempt.provider,
        failureCode: attempt.failureCode,
        recoverable: attempt.recoverable,
      })),
      [
        {
          attempt: 1,
          provider: "anthropic",
          failureCode: "provider_unavailable",
          recoverable: true,
        },
        {
          attempt: 2,
          provider: "openai",
          failureCode: "provider_failed",
          recoverable: false,
        },
      ],
    );
    assert.equal(
      execFileSync("git", ["status", "--porcelain=v1"], {
        cwd: fixture.projectPath,
        encoding: "utf8",
      }),
      "",
    );
  } finally {
    fixture.cleanup();
  }
});

test("loop run rejects fallback provider options without an explicit fallback provider", () => {
  const fixture = setupFixture();
  try {
    const result = spawnSync(
      tsxPath,
      [
        cliPath,
        "run",
        "example",
        "--mode",
        "execute",
        "--provider",
        "claude_code",
        "--provider-executable",
        fixture.missingClaude,
        "--fallback-provider-model",
        "gpt-5.6-luna",
        "--json",
      ],
      {
        cwd: fixture.root,
        encoding: "utf8",
        timeout: 10_000,
      },
    );

    assert.equal(result.status, 1);
    const error = JSON.parse(result.stdout) as {
      error?: { code?: string; message?: string };
    };
    assert.equal(error.error?.code, "unsupported_provider");
    assert.match(
      error.error?.message ?? "",
      /Fallback provider options require --fallback-provider/,
    );
  } finally {
    fixture.cleanup();
  }
});
