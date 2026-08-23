import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { describe, it } from "node:test";
import { withRagIndexLock } from "./rag-index-lock.js";

describe("rag-search command", () => {
  function rebuildIndex(): void {
    rmSync(".loop-engine", { recursive: true, force: true });

    execSync("pnpm run rag-index", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  /**
   * Runs `rag-search --json` and returns its exit status and parsed
   * stdout, whether the command succeeded or failed. `execFileSync` throws
   * on a non-zero exit code, so both branches are normalized here.
   */
  function runRagSearchJson(args: readonly string[]): {
    status: number;
    json: { error?: unknown; results?: unknown };
  } {
    try {
      const output = execFileSync(
        "pnpm",
        ["exec", "tsx", "src/cli.ts", "rag-search", ...args, "--json"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      return { status: 0, json: JSON.parse(output) };
    } catch (caught) {
      const failure = caught as { status?: number; stdout?: string };
      return {
        status: failure.status ?? 1,
        json: JSON.parse(failure.stdout ?? "{}"),
      };
    }
  }

  it("searches the local RAG index through the npm argument separator", async () => {
    await withRagIndexLock(() => {
      rebuildIndex();

      const output = execSync("pnpm run rag-search -- roadmap", {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      assert.match(output, /Results for "roadmap":/);
      assert.match(output, /docs\//);
    });
  });

  it("prints snippets for matching results", async () => {
    await withRagIndexLock(() => {
      rebuildIndex();

      const output = execSync("pnpm run rag-search -- roadmap", {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      assert.match(output, /score \d+/);
      assert.match(output, /\n  .+/);
    });
  });

  it("prints section titles for matching results", async () => {
    await withRagIndexLock(() => {
      rebuildIndex();

      const output = execSync("pnpm run rag-search -- roadmap", {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      assert.match(output, /— .* — .* — score \d+/);
    });
  });

  it("prints json results when requested", async () => {
    await withRagIndexLock(() => {
      rebuildIndex();

      const output = execSync(
        "pnpm exec tsx src/cli.ts rag-search roadmap --json",
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      const json = JSON.parse(output) as {
        schemaVersion?: unknown;
        query?: unknown;
        results?: unknown;
      };

      assert.equal(json.schemaVersion, 1);
      assert.equal(json.query, "roadmap");
      assert.ok(Array.isArray(json.results));
    });
  });

  it("limits json results when requested", async () => {
    await withRagIndexLock(() => {
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
  });

  it("filters json results by path prefix", async () => {
    await withRagIndexLock(() => {
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

  // T2 — rag-search without a query fails closed with a stable error and
  // an empty result set.
  it("returns missing_query and exits non-zero without a query", async () => {
    await withRagIndexLock(() => {
      rebuildIndex();

      const { status, json } = runRagSearchJson([]);

      assert.equal(status, 1);
      assert.equal(json.error, "missing_query");
      assert.deepEqual(json.results, []);
    });
  });

  // T3 — G3: a missing index degrades to the existing missing_index error,
  // never an exception.
  it("returns missing_index and exits non-zero when the index is missing", async () => {
    await withRagIndexLock(() => {
      rmSync(".loop-engine", { recursive: true, force: true });

      try {
        const { status, json } = runRagSearchJson(["roadmap"]);

        assert.equal(status, 1);
        assert.equal(json.error, "missing_index");
      } finally {
        rebuildIndex();
      }
    });
  });

  // T4 — G3: an unreadable/truncated index, or one with an unexpected
  // schemaVersion, degrades to missing_index rather than throwing.
  it("returns missing_index without throwing on a corrupted index", async () => {
    await withRagIndexLock(() => {
      rebuildIndex();

      try {
        writeFileSync(".loop-engine/rag-index.json", "{ not json");
        const truncated = runRagSearchJson(["roadmap"]);
        assert.equal(truncated.status, 1);
        assert.equal(truncated.json.error, "missing_index");

        writeFileSync(
          ".loop-engine/rag-index.json",
          JSON.stringify({ schemaVersion: 2, documents: [] }),
        );
        const wrongSchema = runRagSearchJson(["roadmap"]);
        assert.equal(wrongSchema.status, 1);
        assert.equal(wrongSchema.json.error, "missing_index");
      } finally {
        rebuildIndex();
      }
    });
  });
});
