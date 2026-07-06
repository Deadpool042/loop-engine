import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { describe, it } from "node:test";

describe("rag-search command", () => {
  function rebuildIndex(): void {
    rmSync(".loop-engine", { recursive: true, force: true });

    execSync("pnpm run rag-index", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  it("searches the local RAG index through the npm argument separator", () => {
    rebuildIndex();

    const output = execSync("pnpm run rag-search -- roadmap", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.match(output, /Results for "roadmap":/);
    assert.match(output, /docs\//);
  });

  it("prints snippets for matching results", () => {
    rebuildIndex();

    const output = execSync("pnpm run rag-search -- roadmap", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.match(output, /score \d+/);
    assert.match(output, /\n  .+/);
  });

  it("prints section titles for matching results", () => {
    rebuildIndex();

    const output = execSync("pnpm run rag-search -- roadmap", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    assert.match(output, /— .* — .* — score \d+/);
  });

  it("prints json results when requested", () => {
    rebuildIndex();

    const output = execSync("pnpm exec tsx src/cli.ts rag-search roadmap --json", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const json = JSON.parse(output) as {
      schemaVersion?: unknown;
      query?: unknown;
      results?: unknown;
    };

    assert.equal(json.schemaVersion, 1);
    assert.equal(json.query, "roadmap");
    assert.ok(Array.isArray(json.results));
  });

  it("limits json results when requested", () => {
    rebuildIndex();

    const output = execSync(
      "pnpm exec tsx src/cli.ts rag-search roadmap --limit 2 --json",
      {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const json = JSON.parse(output) as {
      results?: unknown[];
    };

    assert.equal(json.results?.length, 2);
  });

  it("filters json results by path prefix", () => {
    rebuildIndex();

    const output = execSync(
      "pnpm exec tsx src/cli.ts rag-search roadmap --path docs/architecture --limit 3 --json",
      {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const json = JSON.parse(output) as {
      pathPrefix?: unknown;
      results?: Array<{ path?: unknown }>;
    };

    assert.equal(json.pathPrefix, "docs/architecture");
    assert.ok(Array.isArray(json.results));
    assert.ok(json.results.length > 0);
    assert.ok(
      json.results.every(
        (result) =>
          typeof result.path === "string" &&
          result.path.startsWith("docs/architecture"),
      ),
    );
  });
});
