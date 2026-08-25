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
