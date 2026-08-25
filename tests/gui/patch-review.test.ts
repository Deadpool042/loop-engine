import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  parseUnifiedPatch,
  readPatchReview,
} from "../../src/gui/desktop/patch-review.js";

const patch = `diff --git a/old.txt b/old.txt\nindex 1..2 100644\n--- a/old.txt\n+++ b/old.txt\n@@ -1,2 +1,2 @@\n-old\n+new\n keep\n\\ No newline at end of file\ndiff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+created\ndiff --git a/gone.txt b/gone.txt\ndeleted file mode 100644\n--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n`;
const exported = {
  path: "/governed/result.patch",
  sha256: createHash("sha256").update(patch).digest("hex"),
  fileCount: 3,
};

describe("GUI governed patch review", () => {
  it("projects a standard multi-file unified diff with line counts and statuses", () => {
    const result = parseUnifiedPatch(patch);
    assert.equal(result?.files.length, 3);
    assert.deepEqual(
      result?.files.map((file) => file.status),
      ["modified", "added", "deleted"],
    );
    assert.equal(result?.additions, 2);
    assert.equal(result?.deletions, 2);
    assert.equal(result?.files[0]?.hunks[0]?.lines[0]?.oldLineNumber, 1);
    assert.equal(result?.files[0]?.hunks[0]?.lines[1]?.newLineNumber, 1);
  });

  it("decodes Git C-quoted paths in diff and file marker headers", () => {
    const quotedPathPatch = `diff --git "a/foo bar.txt" "b/foo bar.txt"\n--- "a/foo bar.txt"\n+++ "b/foo bar.txt"\n@@ -1 +1 @@\n-before\n+after\n`;
    const result = parseUnifiedPatch(quotedPathPatch);
    assert.equal(result?.files[0]?.oldPath, "foo bar.txt");
    assert.equal(result?.files[0]?.newPath, "foo bar.txt");
  });

  it("strictly decodes Git C-quoted octal UTF-8 path bytes", () => {
    const quotedPathPatch = `diff --git "a/caf\\303\\251\\tmenu.txt" "b/caf\\303\\251\\tmenu.txt"\n--- "a/caf\\303\\251\\tmenu.txt"\n+++ "b/caf\\303\\251\\tmenu.txt"\n@@ -1 +1 @@\n-before\n+after\n`;
    const result = parseUnifiedPatch(quotedPathPatch);
    assert.equal(result?.files[0]?.oldPath, "café\tmenu.txt");
  });

  it("decodes Git C-quoted rename paths", () => {
    const renamePatch = `diff --git "a/old\\tname.txt" "b/new\\tname.txt"\nsimilarity index 100%\nrename from "old\\tname.txt"\nrename to "new\\tname.txt"\n`;
    const result = parseUnifiedPatch(renamePatch);
    assert.equal(result?.files[0]?.status, "renamed");
    assert.equal(result?.files[0]?.oldPath, "old\tname.txt");
    assert.equal(result?.files[0]?.newPath, "new\tname.txt");
  });

  it("fails closed for malformed Git C-quoted path headers", () => {
    const validBody = `\n--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-before\n+after\n`;
    assert.equal(
      parseUnifiedPatch(`diff --git "a/bad\\q.txt" "b/bad\\q.txt"${validBody}`),
      null,
    );
    assert.equal(
      parseUnifiedPatch(
        `diff --git "a/unterminated.txt b/unterminated.txt${validBody}`,
      ),
      null,
    );
    assert.equal(
      parseUnifiedPatch(`diff --git a/file.txt b/file.txt extra${validBody}`),
      null,
    );
  });

  it("verifies the governed export before returning a projection", async () => {
    const result = await readPatchReview(exported, {
      lstat: async () =>
        ({
          isFile: () => true,
          isSymbolicLink: () => false,
          size: Buffer.byteLength(patch),
        }) as never,
      readFile: async () => Buffer.from(patch) as never,
    });
    assert.equal(result.status, "ready");
  });

  it("fails closed for missing, symlinked, oversized, altered, invalid and binary patches", async () => {
    const lstat = async () =>
      ({ isFile: () => true, isSymbolicLink: () => false, size: 5 }) as never;
    const missing = async () => {
      throw Object.assign(new Error(), { code: "ENOENT" });
    };
    assert.equal(
      (await readPatchReview(exported, { lstat: missing as never })).status,
      "missing_patch",
    );
    assert.equal(
      (
        await readPatchReview(exported, {
          lstat: async () =>
            ({
              isFile: () => true,
              isSymbolicLink: () => true,
              size: 5,
            }) as never,
        })
      ).status,
      "missing_patch",
    );
    assert.equal(
      (
        await readPatchReview(exported, {
          lstat: async () =>
            ({
              isFile: () => true,
              isSymbolicLink: () => false,
              size: 100,
            }) as never,
          maxBytes: 10,
        })
      ).status,
      "too_large",
    );
    assert.equal(
      (
        await readPatchReview(exported, {
          lstat,
          readFile: async () => Buffer.from("changed") as never,
        })
      ).status,
      "integrity_mismatch",
    );
    const invalid = Buffer.from("not a diff\n");
    const invalidExport = {
      ...exported,
      sha256: createHash("sha256").update(invalid).digest("hex"),
      fileCount: 1,
    };
    assert.equal(
      (
        await readPatchReview(invalidExport, {
          lstat,
          readFile: async () => invalid as never,
        })
      ).status,
      "invalid_patch",
    );
    const binary = Buffer.from("GIT binary patch\n");
    const binaryExport = {
      ...exported,
      sha256: createHash("sha256").update(binary).digest("hex"),
      fileCount: 1,
    };
    assert.equal(
      (
        await readPatchReview(binaryExport, {
          lstat,
          readFile: async () => binary as never,
        })
      ).status,
      "unsupported_binary",
    );
  });
});
