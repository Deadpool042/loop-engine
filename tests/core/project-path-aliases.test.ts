import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

test("declared path is selected when it is the only existing candidate (VPS layout)", () => {
  const existing = new Set(["../CREATYSS"]);
  assert.equal(
    resolveProjectPath(
      { path: "../CREATYSS", path_aliases: ["../creatyss"] },
      (candidate) => existing.has(candidate),
    ),
    "../CREATYSS",
  );
});

test("multiple existing candidates fail closed instead of selecting the primary silently", () => {
  const existing = new Set([
    "../CREATYSS",
    "../creatyss",
    "../../apps/clients/creatyss",
  ]);
  assert.throws(
    () =>
      resolveProjectPath(
        {
          path: "../CREATYSS",
          path_aliases: ["../creatyss", "../../apps/clients/creatyss"],
        },
        (candidate) => existing.has(candidate),
      ),
    /ambiguous/,
  );
});

test("first existing alias is used when path is absent (Mac layout)", () => {
  const existing = new Set(["../lp-infra"]);
  assert.equal(
    resolveProjectPath(
      {
        path: "../lp-infra-runtime",
        path_aliases: ["../missing", "../lp-infra"],
      },
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

test("Mac and target layouts resolve when each is present alone", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-layouts-"));
  const previous = process.cwd();
  try {
    const currentLoop = join(root, "current", "loop-engine");
    mkdirSync(currentLoop, { recursive: true });
    mkdirSync(join(root, "current", "creatyss"));
    mkdirSync(join(root, "current", "lp-infra"));
    process.chdir(currentLoop);
    assert.equal(
      resolveProjectPath({
        path: "../CREATYSS",
        path_aliases: ["../creatyss"],
      }),
      "../creatyss",
    );
    assert.equal(
      resolveProjectPath({
        path: "../lp-infra-runtime",
        path_aliases: ["../lp-infra"],
      }),
      "../lp-infra",
    );

    const targetLoop = join(root, "target", "platform", "loop-engine");
    mkdirSync(targetLoop, { recursive: true });
    mkdirSync(join(root, "target", "apps", "clients", "creatyss"), {
      recursive: true,
    });
    mkdirSync(join(root, "target", "platform", "lp-infra"));
    process.chdir(targetLoop);
    assert.equal(
      resolveProjectPath({ path: "../../apps/clients/creatyss" }),
      "../../apps/clients/creatyss",
    );
    assert.equal(resolveProjectPath({ path: "../lp-infra" }), "../lp-infra");
  } finally {
    process.chdir(previous);
    rmSync(root, { recursive: true, force: true });
  }
});

test("historically documented VPS layout selects exact-case primary paths", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-vps-layout-"));
  const previous = process.cwd();
  try {
    const projects = join(root, "home", "ubuntu", "Projects");
    const loop = join(projects, "loop-engine");
    mkdirSync(loop, { recursive: true });
    mkdirSync(join(projects, "CREATYSS"));
    mkdirSync(join(projects, "lp-infra-runtime"));
    process.chdir(loop);
    assert.equal(
      resolveProjectPath({
        path: "../CREATYSS",
        path_aliases: ["../creatyss"],
      }),
      "../CREATYSS",
    );
    assert.equal(
      resolveProjectPath({
        path: "../lp-infra-runtime",
        path_aliases: ["../lp-infra"],
      }),
      "../lp-infra-runtime",
    );
  } finally {
    process.chdir(previous);
    rmSync(root, { recursive: true, force: true });
  }
});

test("coexisting same-identity and different-identity Git candidates both fail closed", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-candidate-identities-"));
  const createRepo = (path: string, remote: string) => {
    mkdirSync(path, { recursive: true });
    const template = join(root, "empty-template");
    mkdirSync(template, { recursive: true });
    execFileSync("git", ["init", "--quiet", `--template=${template}`, path]);
    execFileSync("git", ["-C", path, "remote", "add", "origin", remote]);
  };
  try {
    const primary = join(root, "creatyss-primary");
    const alias = join(root, "creatyss-alias");
    createRepo(primary, "https://github.com/Deadpool042/CREATYSS.git");
    createRepo(alias, "https://github.com/Deadpool042/CREATYSS.git");
    const candidates = { path: primary, path_aliases: [alias] };
    assert.equal(
      execFileSync("git", ["-C", primary, "remote", "get-url", "origin"], {
        encoding: "utf8",
      }).trim(),
      execFileSync("git", ["-C", alias, "remote", "get-url", "origin"], {
        encoding: "utf8",
      }).trim(),
    );
    assert.throws(
      () => resolveProjectPath(candidates, existsSync),
      /ambiguous/,
    );

    execFileSync("git", [
      "-C",
      alias,
      "remote",
      "set-url",
      "origin",
      "https://github.com/example/other.git",
    ]);
    assert.notEqual(
      execFileSync("git", ["-C", primary, "remote", "get-url", "origin"], {
        encoding: "utf8",
      }).trim(),
      execFileSync("git", ["-C", alias, "remote", "get-url", "origin"], {
        encoding: "utf8",
      }).trim(),
    );
    assert.throws(
      () => resolveProjectPath(candidates, existsSync),
      /ambiguous/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("absolute candidates are accepted without a root policy", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-absolute-path-"));
  try {
    const outside = join(root, "outside-project");
    mkdirSync(outside);
    assert.equal(resolveProjectPath({ path: outside }, existsSync), outside);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("symlink candidates are accepted without resolving or checking their target", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-symlink-path-"));
  try {
    const outside = join(root, "outside-project");
    const linked = join(root, "linked-project");
    mkdirSync(outside);
    symlinkSync(outside, linked, "dir");
    assert.equal(resolveProjectPath({ path: linked }, existsSync), linked);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
