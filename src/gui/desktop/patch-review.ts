import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";

import type { ExecutionResultDetail } from "./execution-result-contract.js";

export const MAX_PATCH_REVIEW_BYTES = 2 * 1024 * 1024;

export type PatchReviewLine = Readonly<{
  type: "context" | "addition" | "deletion" | "no_newline";
  oldLineNumber: number | null;
  newLineNumber: number | null;
  content: string;
}>;
export type PatchReviewFile = Readonly<{
  oldPath: string | null;
  newPath: string | null;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: readonly Readonly<{
    header: string;
    lines: readonly PatchReviewLine[];
  }>[];
}>;
export type PatchReviewDetail = Readonly<{
  status: "ready";
  sha256: string;
  fileCount: number;
  additions: number;
  deletions: number;
  files: readonly PatchReviewFile[];
}>;
export type PatchReviewResult =
  | PatchReviewDetail
  | Readonly<{
      status:
        | "no_patch"
        | "missing_patch"
        | "integrity_mismatch"
        | "invalid_patch"
        | "too_large"
        | "unsupported_binary"
        | "internal_read_failure";
    }>;

type MutableFile = {
  oldPath: string | null;
  newPath: string | null;
  status: PatchReviewFile["status"];
  additions: number;
  deletions: number;
  hunks: { header: string; lines: PatchReviewLine[] }[];
};

function finishFile(file: MutableFile): PatchReviewFile {
  return Object.freeze({
    ...file,
    hunks: Object.freeze(
      file.hunks.map((hunk) =>
        Object.freeze({ ...hunk, lines: Object.freeze(hunk.lines) }),
      ),
    ),
  });
}

function parsePath(value: string): string | null {
  if (value === "/dev/null") return null;
  return value.startsWith("a/") || value.startsWith("b/")
    ? value.slice(2)
    : null;
}

/** Parses only the canonical, unquoted unified diff emitted by this exporter. */
export function parseUnifiedPatch(
  content: string,
): Omit<PatchReviewDetail, "status" | "sha256" | "fileCount"> | null {
  if (content.includes("GIT binary patch") || content.includes("Binary files "))
    return null;
  const files: MutableFile[] = [];
  let file: MutableFile | null = null;
  let hunk: { header: string; lines: PatchReviewLine[] } | null = null;
  let oldLine = 0;
  let newLine = 0;
  for (const line of content.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/(\S+) b\/(\S+)$/.exec(line);
      if (!match) return null;
      const nextFile: MutableFile = {
        oldPath: match[1]!,
        newPath: match[2]!,
        status: "modified",
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      file = nextFile;
      files.push(nextFile);
      hunk = null;
      continue;
    }
    if (file === null) continue;
    if (line.startsWith("new file mode ")) {
      file.status = "added";
      continue;
    }
    if (line.startsWith("deleted file mode ")) {
      file.status = "deleted";
      continue;
    }
    if (line.startsWith("rename from ")) {
      file.status = "renamed";
      file.oldPath = line.slice(12);
      continue;
    }
    if (line.startsWith("rename to ")) {
      file.status = "renamed";
      file.newPath = line.slice(10);
      continue;
    }
    if (line.startsWith("--- ")) {
      const path = parsePath(line.slice(4));
      if (path === null && line.slice(4) !== "/dev/null") return null;
      file.oldPath = path;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const path = parsePath(line.slice(4));
      if (path === null && line.slice(4) !== "/dev/null") return null;
      file.newPath = path;
      continue;
    }
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (hunk === null) continue;
    if (line.startsWith("+")) {
      hunk.lines.push({
        type: "addition",
        oldLineNumber: null,
        newLineNumber: newLine++,
        content: line.slice(1),
      });
      file.additions++;
      continue;
    }
    if (line.startsWith("-")) {
      hunk.lines.push({
        type: "deletion",
        oldLineNumber: oldLine++,
        newLineNumber: null,
        content: line.slice(1),
      });
      file.deletions++;
      continue;
    }
    if (line.startsWith(" ")) {
      hunk.lines.push({
        type: "context",
        oldLineNumber: oldLine++,
        newLineNumber: newLine++,
        content: line.slice(1),
      });
      continue;
    }
    if (line === "\\ No newline at end of file") {
      hunk.lines.push({
        type: "no_newline",
        oldLineNumber: null,
        newLineNumber: null,
        content: line.slice(2),
      });
      continue;
    }
    if (line !== "") return null;
  }
  if (files.length === 0) return null;
  const parsed = files.map(finishFile);
  return Object.freeze({
    files: Object.freeze(parsed),
    additions: parsed.reduce((total, item) => total + item.additions, 0),
    deletions: parsed.reduce((total, item) => total + item.deletions, 0),
  });
}

export async function readPatchReview(
  patchExport: ExecutionResultDetail["patchExport"],
  dependencies: Readonly<{
    lstat?: typeof lstat;
    readFile?: typeof readFile;
    maxBytes?: number;
  }> = {},
): Promise<PatchReviewResult> {
  if (patchExport === null) return { status: "no_patch" };
  const inspect = dependencies.lstat ?? lstat;
  const read = dependencies.readFile ?? readFile;
  const maxBytes = dependencies.maxBytes ?? MAX_PATCH_REVIEW_BYTES;
  try {
    const stat = await inspect(patchExport.path);
    if (!stat.isFile() || stat.isSymbolicLink())
      return { status: "missing_patch" };
    if (stat.size > maxBytes) return { status: "too_large" };
    const bytes = await read(patchExport.path);
    if (bytes.length > maxBytes) return { status: "too_large" };
    if (createHash("sha256").update(bytes).digest("hex") !== patchExport.sha256)
      return { status: "integrity_mismatch" };
    if (bytes.includes(0)) return { status: "unsupported_binary" };
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return { status: "unsupported_binary" };
    }
    if (
      content.includes("GIT binary patch") ||
      content.includes("Binary files ")
    )
      return { status: "unsupported_binary" };
    const parsed = parseUnifiedPatch(content);
    if (parsed === null) return { status: "invalid_patch" };
    if (parsed.files.length !== patchExport.fileCount)
      return { status: "integrity_mismatch" };
    return Object.freeze({
      status: "ready",
      sha256: patchExport.sha256,
      fileCount: patchExport.fileCount,
      ...parsed,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ELOOP")
    )
      return { status: "missing_patch" };
    return { status: "internal_read_failure" };
  }
}
