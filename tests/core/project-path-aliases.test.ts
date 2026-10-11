import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { loadConfig, resolveProjectPath } from "../../src/core/config.js";

test("project path is unchanged without aliases", () => {
  assert.equal(
    resolveProjectPath({ path: "../CREATYSS" }, () => false),
    "../CREATYSS",
  );
});

test("declared path wins when it exists (VPS layout)", () => {
  const existing = new Set(["../CREATYSS", "../creatyss"]);
  assert.equal(
    resolveProjectPath(
      { path: "../CREATYSS", path_aliases: ["../creatyss"] },
      (candidate) => existing.has(candidate),
    ),
    "../CREATYSS",
  );
});

test("first existing alias is used when path is absent (Mac layout)", () => {
  const existing = new Set(["../lp-infra"]);
  assert.equal(
    resolveProjectPath(
      { path: "../lp-infra-runtime", path_aliases: ["../missing", "../lp-infra"] },
      (candidate) => existing.has(candidate),
    ),
    "../lp-infra",
  );
});

test("declared path is kept when nothing exists, preserving current errors", () => {
  assert.equal(
    resolveProjectPath(
      { path: "../lp-infra-runtime", path_aliases: ["../lp-infra"] },
      () => false,
    ),
    "../lp-infra-runtime",
  );
});

test("loadConfig applies exact-case alias resolution from the process cwd", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-aliases-"));
  const previous = process.cwd();
  try {
    mkdirSync(join(root, "work", "loop"), { recursive: true });
    mkdirSync(join(root, "work", "creatyss"));
    writeFileSync(
      join(root, "work", "loop", "projects.yaml"),
      [
        "projects:",
        "  - name: creatyss",
        "    path: ../CREATYSS",
        "    path_aliases: [../creatyss]",
        "    type: next-prisma",
        "    required_docs: []",
        "    validation: []",
        "  - name: plain",
        "    path: ../plain",
        "    type: x",
        "    required_docs: []",
        "    validation: []",
        "",
      ].join("\n"),
    );
    process.chdir(join(root, "work", "loop"));
    const config = loadConfig();
    // Exact-case matching: "../CREATYSS" must not be accepted on case-insensitive filesystems.
    assert.equal(config.projects[0]?.path, "../creatyss");
    assert.equal(config.projects[1]?.path, "../plain");
  } finally {
    process.chdir(previous);
    rmSync(root, { recursive: true, force: true });
  }
});
