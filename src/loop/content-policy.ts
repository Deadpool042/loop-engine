import { lstat, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import type { LoopExecutionPlan } from "./execution-plan.js";

export type ContentPolicyInspection =
  | Readonly<{ outcome: "compliant" }>
  | Readonly<{ outcome: "violation" }>
  | Readonly<{ outcome: "uninspectable" }>;

function isInsideWorktree(cwd: string, path: string): boolean {
  return path.startsWith(`${cwd}${sep}`);
}

/**
 * Deterministically inspects every current, regular modified file against the
 * project-owned literal content policy. This guard deliberately exposes no
 * matched terms: public execution diagnostics must remain redacted.
 *
 * Deleted files have no generated content to inspect. Any other unreadable or
 * non-regular modified entry fails closed while a content policy is active.
 */
export async function inspectWorktreeContentPolicy(
  plan: LoopExecutionPlan,
  cwd: string,
  modifiedFiles: readonly string[],
): Promise<ContentPolicyInspection> {
  const terms = plan.brief?.forbiddenContentTerms;
  if (terms === undefined || terms.length === 0) {
    return Object.freeze({ outcome: "compliant" });
  }

  const normalizedTerms = terms.map((term) => term.toLocaleLowerCase("en-US"));
  for (const file of modifiedFiles) {
    const path = resolve(cwd, file);
    if (!isInsideWorktree(cwd, path)) {
      return Object.freeze({ outcome: "uninspectable" });
    }

    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        return Object.freeze({ outcome: "uninspectable" });
      }
      const content = (await readFile(path, "utf8")).toLocaleLowerCase("en-US");
      if (normalizedTerms.some((term) => content.includes(term))) {
        return Object.freeze({ outcome: "violation" });
      }
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      return Object.freeze({ outcome: "uninspectable" });
    }
  }

  return Object.freeze({ outcome: "compliant" });
}
