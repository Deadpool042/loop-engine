import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { withRagIndexLock } from "./rag-index-lock.js";

const RAG_SOURCE_PATHS = [
  "README.md",
  "CHANGELOG.md",
  "CLAUDE.md",
  "docs/architecture",
  "docs/audits",
  "docs/roadmap",
  "docs/integrations",
  "docs/releases",
];

const FORBIDDEN_PATH_PREFIXES = [
  "src/",
  "node_modules/",
  ".env",
  "tests/",
] as const;

type RagIndexDocument = Readonly<{ path: string }>;

function loadIndexDocuments(): readonly RagIndexDocument[] {
  const index = JSON.parse(
    readFileSync(".loop-engine/rag-index.json", "utf8"),
  ) as { documents?: RagIndexDocument[] };
  return index.documents ?? [];
}

describe("rag-index command", () => {
  it("generates a parsable local RAG index", async () => {
    await withRagIndexLock(() => {
      rmSync(".loop-engine", { recursive: true, force: true });

      execSync("pnpm exec tsx src/cli.ts rag-index", {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      assert.equal(existsSync(".loop-engine/rag-index.json"), true);

      const index = JSON.parse(
        readFileSync(".loop-engine/rag-index.json", "utf8"),
      ) as {
        schemaVersion?: unknown;
        documents?: Array<{
          sectionTitle?: unknown;
          headingLevel?: unknown;
        }>;
      };

      assert.equal(index.schemaVersion, 1);
      assert.ok(Array.isArray(index.documents));
      assert.ok(index.documents.length > 0);
      assert.equal(typeof index.documents[0]?.sectionTitle, "string");
      assert.equal(typeof index.documents[0]?.headingLevel, "number");
    });
  });

  // T1 — every indexed document stays within RAG_SOURCE_PATHS, is a .md
  // file, and never leaks project source/test/secret/dependency paths.
  it("only indexes markdown documents under the declared RAG source paths", async () => {
    await withRagIndexLock(() => {
      rmSync(".loop-engine", { recursive: true, force: true });

      execSync("pnpm exec tsx src/cli.ts rag-index", {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      const documents = loadIndexDocuments();
      assert.ok(documents.length > 0);

      for (const document of documents) {
        assert.equal(
          document.path.endsWith(".md"),
          true,
          `expected a .md path, got ${document.path}`,
        );
        assert.equal(
          RAG_SOURCE_PATHS.some(
            (sourcePath) =>
              document.path === sourcePath ||
              document.path.startsWith(`${sourcePath}/`),
          ),
          true,
          `${document.path} is outside RAG_SOURCE_PATHS`,
        );
        for (const forbidden of FORBIDDEN_PATH_PREFIXES) {
          assert.equal(
            document.path.startsWith(forbidden),
            false,
            `${document.path} must not be indexed (forbidden prefix ${forbidden})`,
          );
        }
      }
    });
  });

  // T5 — after a rebuild, every indexed path must exist on disk.
  it("only indexes paths that exist on disk after a rebuild", async () => {
    await withRagIndexLock(() => {
      rmSync(".loop-engine", { recursive: true, force: true });

      execSync("pnpm exec tsx src/cli.ts rag-index", {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      const documents = loadIndexDocuments();
      assert.ok(documents.length > 0);

      for (const document of documents) {
        assert.equal(
          existsSync(document.path),
          true,
          `${document.path} does not exist on disk`,
        );
      }
    });
  });

  // T6 — G1 root-anchoring guard: running rag-index from outside the Loop
  // Engine repository must fail explicitly and must not write anything.
  // This test never touches the shared .loop-engine artifact (it operates
  // in an unrelated temporary directory), so it does not need the lock.
  it("fails explicitly and writes nothing when run outside the repository root", () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "loop-engine-rag-guard-"));

    const tsxBin = join(process.cwd(), "node_modules/.bin/tsx");
    const cliPath = join(process.cwd(), "src/cli.ts");

    try {
      assert.throws(() => {
        execFileSync(tsxBin, [cliPath, "rag-index"], {
          cwd: outsideDir,
          stdio: ["ignore", "pipe", "pipe"],
        });
      });

      assert.equal(existsSync(join(outsideDir, ".loop-engine")), false);
      assert.deepEqual(readdirSync(outsideDir), []);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
