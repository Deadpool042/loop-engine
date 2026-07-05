import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { describe, it } from "node:test";

describe("rag-index command", () => {
  it("generates a parsable local RAG index", () => {
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
