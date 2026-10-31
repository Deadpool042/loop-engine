import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadConfig,
  resolveProjectPath,
  resolveProjectsRoot,
} from "../../src/core/config.js";

test("declared primary path is retained when no candidate exists", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-aliases-"));
  const cwd = join(root, "platform", "loop-engine");
  mkdirSync(cwd, { recursive: true });
  try {
    assert.equal(
      resolveProjectPath(
        { path: "../CREATYSS" },
        resolveProjectsRoot(root),
        cwd,
      ),
      "../CREATYSS",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the declared candidate is used when it is the only existing exact-case path", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-aliases-"));
  const cwd = join(root, "platform", "loop-engine");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(join(root, "CREATYSS"));
  try {
    assert.equal(
      resolveProjectPath(
        { path: "../CREATYSS", path_aliases: ["../creatyss"] },
        resolveProjectsRoot(root),
        cwd,
      ),
      "../CREATYSS",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the exact-case alias is selected when the primary path is absent", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-aliases-"));
  const cwd = join(root, "platform", "loop-engine");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(join(root, "platform", "lp-infra"));
  try {
    assert.equal(
      resolveProjectPath(
        {
          path: "../lp-infra-runtime",
          path_aliases: ["../missing", "../lp-infra"],
        },
        resolveProjectsRoot(root),
        cwd,
      ),
      "../lp-infra",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("DW path transition selects the sole existing path and rejects coexistence", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-dw-m3-"));
  const cwd = join(root, "loop-engine");
  const previous = join(root, "development-workspace");
  const target = join(root, "platform", "development-workspace");
  const project = {
    path: "../platform/development-workspace",
    path_aliases: ["../development-workspace"],
  };
  mkdirSync(cwd, { recursive: true });
  try {
    const projectsRoot = resolveProjectsRoot(root);
    mkdirSync(previous);
    assert.equal(resolveProjectPath(project, projectsRoot, cwd), "../development-workspace");

    mkdirSync(target, { recursive: true });
    assert.throws(
      () => resolveProjectPath(project, projectsRoot, cwd),
      /Project path is ambiguous/,
    );

    rmSync(previous, { recursive: true });
    assert.equal(resolveProjectPath(project, projectsRoot, cwd), "../platform/development-workspace");

    rmSync(target, { recursive: true });
    mkdirSync(previous);
    assert.equal(resolveProjectPath(project, projectsRoot, cwd), "../development-workspace");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("loadConfig applies exact-case alias resolution using its explicit projects root", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-aliases-"));
  const cwd = join(root, "work", "loop");
  const previous = process.cwd();
  try {
    mkdirSync(cwd, { recursive: true });
    mkdirSync(join(root, "work", "creatyss"));
    writeFileSync(
      join(cwd, "projects.yaml"),
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
    process.chdir(cwd);
    const config = loadConfig(root);
    assert.equal(
      config.projects[0]?.path,
      join(realpathSync(root), "work", "creatyss"),
    );
    assert.equal(
      config.projects[1]?.path,
      join(realpathSync(root), "work", "plain"),
    );
  } finally {
    process.chdir(previous);
    rmSync(root, { recursive: true, force: true });
  }
});

test("historical, current, and ADR-0021 layouts resolve their exact existing candidates", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-layouts-"));
  const previous = process.cwd();
  const projectsRoot = resolveProjectsRoot(root);
  try {
    const historicalLoop = join(root, "historical", "loop-engine");
    mkdirSync(historicalLoop, { recursive: true });
    mkdirSync(join(root, "historical", "CREATYSS"));
    process.chdir(historicalLoop);
    assert.equal(
      resolveProjectPath(
        { path: "../CREATYSS", path_aliases: ["../creatyss"] },
        projectsRoot,
      ),
      "../CREATYSS",
    );

    const currentLoop = join(root, "current", "loop-engine");
    mkdirSync(currentLoop, { recursive: true });
    mkdirSync(join(root, "current", "creatyss"));
    process.chdir(currentLoop);
    assert.equal(
      resolveProjectPath(
        { path: "../CREATYSS", path_aliases: ["../creatyss"] },
        projectsRoot,
      ),
      "../creatyss",
    );

    const targetLoop = join(root, "target", "platform", "loop-engine");
    mkdirSync(targetLoop, { recursive: true });
    mkdirSync(join(root, "target", "apps", "clients", "creatyss"), {
      recursive: true,
    });
    mkdirSync(join(root, "target", "platform", "lp-infra"));
    process.chdir(targetLoop);
    assert.equal(
      resolveProjectPath({ path: "../../apps/clients/creatyss" }, projectsRoot),
      "../../apps/clients/creatyss",
    );
    assert.equal(
      resolveProjectPath({ path: "../lp-infra" }, projectsRoot),
      "../lp-infra",
    );
  } finally {
    process.chdir(previous);
    rmSync(root, { recursive: true, force: true });
  }
});
