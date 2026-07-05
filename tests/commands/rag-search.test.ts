import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { describe, it } from "node:test";

describe("rag-search command", () => {
  it("searches the local RAG index through the npm argument separator", () => {
    rmSync(".loop-engine", { recursive: true, force: true });

    execSync("pnpm run rag-index", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const output = execSync("pnpm run rag-search -- roadmap", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.match(output, /Results for "roadmap":/);
    assert.match(output, /docs\//);
  });

  it("prints snippets for matching results", () => {
    rmSync(".loop-engine", { recursive: true, force: true });

    execSync("pnpm run rag-index", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const output = execSync("pnpm run rag-search -- roadmap", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.match(output, /score \d+/);
    assert.match(output, /\n  .+/);
  });

  it("prints section titles for matching results", () => {
    rmSync(".loop-engine", { recursive: true, force: true });

    execSync("pnpm run rag-index", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const output = execSync("pnpm run rag-search -- roadmap", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.match(output, /— .* — .* — score \d+/);
  });
});
