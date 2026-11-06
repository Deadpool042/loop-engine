import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse as parseYaml } from "yaml";

import { loadConfig } from "../../src/core/config.js";
import {
  PROJECT_NAME_PATTERN,
  assertValidProjectRegistry,
  isValidProjectName,
} from "../../src/core/project-identity.js";

const entry = (name: unknown, extra: Record<string, unknown> = {}) => ({
  name,
  path: "../x",
  type: "x",
  required_docs: [],
  validation: [],
  ...extra,
});

test("conforming, distinct names are accepted", () => {
  assert.doesNotThrow(() =>
    assertValidProjectRegistry([entry("alpha"), entry("a-1"), entry("0x")]),
  );
  assert.doesNotThrow(() => assertValidProjectRegistry([]));
});

test("the name rule keeps its exact historical definition", () => {
  assert.equal(PROJECT_NAME_PATTERN.source, "^[a-z0-9][a-z0-9-]{0,62}$");
  assert.equal(isValidProjectName("a".repeat(63)), true);
  assert.equal(isValidProjectName("a".repeat(64)), false);
});

test("non-conforming names are refused", () => {
  const bad: unknown[] = [
    "",
    "-lead",
    "Upper",
    "with space",
    "dot.name",
    "slash/name",
    " p",
    "p ",
    "p\n",
    "café",
    "a​b",
    "a".repeat(64),
    undefined,
    null,
    42,
    ["a"],
  ];
  for (const name of bad) {
    assert.throws(
      () => assertValidProjectRegistry([entry("ok"), entry(name)]),
      /Invalid project registry: non-conforming project names: #1 /,
      JSON.stringify(name),
    );
  }
  assert.throws(
    () => assertValidProjectRegistry([null]),
    /non-conforming project names: #0 <undefined>/,
  );
});

test("duplicates are refused, whatever their flags", () => {
  assert.throws(
    () => assertValidProjectRegistry([entry("dup"), entry("dup")]),
    /duplicated project names: "dup"/,
  );
  assert.throws(
    () =>
      assertValidProjectRegistry([
        entry("gone", { archived: true, retired: true }),
        entry("gone"),
      ]),
    /duplicated project names: "gone"/,
  );
  assert.throws(
    () =>
      assertValidProjectRegistry([
        entry("old", { archived: true }),
        entry("old", { archived: true }),
      ]),
    /duplicated project names: "old"/,
  );
});

test("all problems are reported together and long values are truncated", () => {
  assert.throws(
    () =>
      assertValidProjectRegistry([
        entry("dup"),
        entry("dup"),
        entry("Bad"),
        entry("x".repeat(500) + "!"),
      ]),
    (error: unknown) => {
      const message = (error as Error).message;
      assert.match(message, /#2 "Bad"/);
      assert.match(message, /duplicated project names: "dup"/);
      assert.ok(message.length < 400);
      return true;
    },
  );
});

test("a retired tombstone keeps its name reserved", () => {
  assert.doesNotThrow(() =>
    assertValidProjectRegistry([
      entry("gone", { archived: true, retired: true }),
      entry("other"),
    ]),
  );
  assert.throws(
    () =>
      assertValidProjectRegistry([
        entry("gone", { archived: true, retired: true }),
        entry("gone", { archived: true, retired: true }),
      ]),
    /duplicated/,
  );
});

function withRegistry(yaml: string, run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "loop-registry-"));
  const previous = process.cwd();
  try {
    const cwd = join(root, "platform", "loop-engine");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(join(root, "platform", "plain"));
    writeFileSync(join(cwd, "projects.yaml"), yaml);
    process.chdir(cwd);
    run(root);
  } finally {
    process.chdir(previous);
    rmSync(root, { recursive: true, force: true });
  }
}

const yamlEntry = (name: string, extra = "") =>
  [
    `  - name: ${name}`,
    "    path: ../plain",
    "    type: x",
    "    required_docs: []",
    "    validation: []",
    extra,
  ]
    .filter((line) => line !== "")
    .join("\n");

test("loadConfig accepts a valid registry unchanged", () => {
  withRegistry(
    [
      "projects:",
      yamlEntry("plain"),
      yamlEntry("old", "    archived: true"),
      "",
    ].join("\n"),
    (root) => {
      const config = loadConfig(root);
      assert.deepEqual(
        config.projects.map((project) => project.name),
        ["plain", "old"],
      );
    },
  );
});

test("loadConfig fails closed on a duplicated name, archived or retired included", () => {
  withRegistry(
    [
      "projects:",
      yamlEntry("plain"),
      yamlEntry("plain", "    archived: true\n    retired: true"),
      "",
    ].join("\n"),
    (root) => {
      assert.throws(
        () => loadConfig(root),
        /duplicated project names: "plain"/,
      );
    },
  );
});

test("loadConfig fails closed on a non-conforming name before touching paths", () => {
  withRegistry(["projects:", yamlEntry('"Plain"'), ""].join("\n"), (root) => {
    assert.throws(
      () => loadConfig(root),
      /Invalid project registry: non-conforming project names: #0 "Plain"/,
    );
  });
});

test("the committed registry is accepted", () => {
  const raw = readFileSync(join(process.cwd(), "projects.yaml"), "utf8");
  const parsed = parseYaml(raw) as { projects: unknown[] };
  assert.doesNotThrow(() => assertValidProjectRegistry(parsed.projects));
});
