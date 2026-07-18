import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const CONTEXT_FILES = [
  "src/context/types.ts",
  "src/context/path.ts",
  "src/context/sources.ts",
  "src/context/context-cost-estimator.ts",
  "src/context/builder.ts",
];

describe("invariant: src/context/ never depends on src/commands/, src/loop/, or src/cli.ts", () => {
  for (const file of CONTEXT_FILES) {
    it(`${file} does not import commands/, loop/, or cli.ts`, () => {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /from\s+["'].*\/(commands|loop)\//);
      assert.doesNotMatch(content, /from\s+["'].*cli\.js["']/);
    });
  }
});

describe("invariant: src/policy/ and src/agents/ never depend on src/context/", () => {
  const policyFiles = [
    "src/policy/types.ts",
    "src/policy/defaults.ts",
    "src/policy/resolver.ts",
  ];
  const agentFiles = [
    "src/agents/types.ts",
    "src/agents/registry.ts",
    "src/agents/selector.ts",
    "src/agents/escalation.ts",
  ];

  for (const file of [...policyFiles, ...agentFiles]) {
    it(`${file} does not import context/`, () => {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /from\s+["'].*\/context\//);
    });
  }
});

describe("invariant: no network call, SDK, or agent/child process is introduced by the context builder", () => {
  for (const file of CONTEXT_FILES) {
    it(`${file} performs no network I/O and spawns no process`, () => {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /\bfetch\(/);
      assert.doesNotMatch(content, /require\(["']https?["']\)/);
      assert.doesNotMatch(content, /child_process/);
    });
  }
});

describe("invariant: the context builder never writes to disk", () => {
  it("src/context/builder.ts only reads files (statSync/readFileSync), never writes", () => {
    const content = readFileSync("src/context/builder.ts", "utf8");
    assert.doesNotMatch(
      content,
      /writeFileSync|appendFileSync|createWriteStream|unlinkSync|rmSync/,
    );
    assert.match(content, /readFileSync/);
    assert.match(content, /statSync/);
  });
});

describe("invariant: MinimalContextPackage reuses ContextBudget from src/policy/types.ts", () => {
  it("src/context/types.ts imports ContextBudget rather than redeclaring it", () => {
    const content = readFileSync("src/context/types.ts", "utf8");
    assert.match(
      content,
      /import type\s*\{\s*ContextBudget\s*\}\s*from\s+["']\.\.\/policy\/types\.js["']/,
    );
  });
});
