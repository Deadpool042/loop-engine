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

function setupProject(roadmap: string): {
  cwd: string;
  cleanup: () => void;
} {
  const cwd = mkdtempSync(join(tmpdir(), "loop-next-command-"));

  writeFileSync(
    join(cwd, "projects.yaml"),
    [
      "projects:",
      "  - name: fixture",
      "    path: .",
      "    type: test",
      "    requires_git: false",
      "    required_docs: []",
      "    validation: []",
      "    roadmap:",
      "      - roadmap.md",
      "",
    ].join("\n"),
  );
  writeFileSync(join(cwd, "roadmap.md"), roadmap);

  return {
    cwd,
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

describe("next command", () => {
  it("reports an exhausted roadmap without recommending a fictitious micro-lot", () => {
    const fixture = setupProject(
      [
        "- [x] Delivered item",
        "- No new lot until the external decision gate is satisfied.",
      ].join("\n"),
    );

    try {
      const output = execFileSync(
        tsxExecutable,
        [cliPath, "next", "fixture"],
        {
          cwd: fixture.cwd,
          encoding: "utf8",
        },
      );

      assert.match(output, /Selectable: 0/);
      assert.match(output, /No selectable roadmap candidate remains\./);
      assert.match(output, /Roadmap has no remaining actionable candidate\./);
      assert.doesNotMatch(
        output,
        /Open the roadmap and select the next safe micro-lot\./,
      );
    } finally {
      fixture.cleanup();
    }
  });
});
