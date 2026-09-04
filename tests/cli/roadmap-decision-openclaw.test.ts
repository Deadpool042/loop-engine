import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "..", "..");
const cliPath = resolve(repoRoot, "src", "cli.ts");
const tsxPath = resolve(repoRoot, "node_modules", ".bin", "tsx");

function setupFixture(): Readonly<{
  root: string;
  fakeBin: string;
  cleanup: () => void;
}> {
  const root = mkdtempSync(join(tmpdir(), "loop-roadmap-decision-openclaw-"));
  const projectPath = join(root, "example");
  const fakeHome = join(root, "home");
  const fakeBin = join(fakeHome, ".openclaw", "bin");
  mkdirSync(projectPath, { recursive: true });
  mkdirSync(fakeBin, { recursive: true });

  writeFileSync(
    join(root, "projects.yaml"),
    [
      "projects:",
      "  - name: example",
      "    path: ./example",
      "    type: fixture",
      "    requires_git: false",
      "    required_docs: []",
      "    validation: []",
      "    planning:",
      "      mode: roadmap",
      "      objective_source: objective.md",
      "    roadmap:",
      "      - roadmap.md",
      "",
    ].join("\n"),
  );
  writeFileSync(join(projectPath, "objective.md"), "Keep the project stable.\n");
  writeFileSync(join(projectPath, "roadmap.md"), "- [x] Existing work is complete.\n");

  const modelOutput = JSON.stringify({
    assessment: { observedGaps: [], assumptions: [] },
    proposal: {
      status: "no_proposal",
      reason: "No material gap is demonstrated by the supplied context.",
    },
  });
  const fakeOpenClaw = join(fakeBin, "openclaw");
  writeFileSync(
    fakeOpenClaw,
    [
      "#!/usr/bin/env node",
      `process.stdout.write(${JSON.stringify(
        JSON.stringify({
          ok: true,
          provider: "openai",
          model: "gpt-5.6-sol",
          outputs: [{ text: modelOutput }],
        }),
      )});`,
      "",
    ].join("\n"),
  );
  chmodSync(fakeOpenClaw, 0o755);

  return {
    root,
    fakeBin,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("roadmap decision accepts the explicit OpenClaw text-only provider without Anthropic credentials", () => {
  const fixture = setupFixture();
  try {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    env.HOME = join(fixture.root, "home");
    env.PATH = `${fixture.fakeBin}${delimiter}${env.PATH ?? ""}`;

    const result = spawnSync(
      tsxPath,
      [
        cliPath,
        "roadmap",
        "decision",
        "example",
        "--request-proposal",
        "--provider",
        "openclaw_agent",
        "--provider-model",
        "openai/gpt-5.6-sol",
        "--provider-effort",
        "low",
        "--provider-timeout-ms",
        "5000",
        "--json",
      ],
      {
        cwd: fixture.root,
        env,
        encoding: "utf8",
        timeout: 15_000,
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout) as {
      decision?: string;
      reason?: string;
      providerCall?: {
        requested?: boolean;
        provider?: string;
        model?: string;
        effort?: string | null;
        status?: string;
      };
    };
    assert.equal(report.decision, "no_proposal");
    assert.equal(
      report.reason,
      "No material gap is demonstrated by the supplied context.",
    );
    assert.deepEqual(report.providerCall, {
      requested: true,
      status: "completed",
      provider: "openclaw_agent",
      model: "openai/gpt-5.6-sol",
      effort: "low",
    });
  } finally {
    fixture.cleanup();
  }
});
