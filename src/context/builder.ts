// Minimal Context Builder (V7.5) — local, deterministic, bounded, no agent
// call. Turns a ProjectSnapshot and a ContextBudget (src/policy/types.ts)
// into a MinimalContextPackage. See docs/architecture/minimal-context-builder.md.

import { readFileSync, statSync } from "node:fs";

import type { ProjectSnapshot } from "../intelligence/snapshot.js";
import type { ContextBudget } from "../policy/types.js";
import { estimateTokens } from "./context-cost-estimator.js";
import { resolveContextPath } from "./path.js";
import { collectContextSources } from "./sources.js";
import type {
  ContextFile,
  ContextOmission,
  ContextOmissionReason,
  MinimalContextPackage,
} from "./types.js";

const BUDGET_OMISSION_REASONS: ReadonlySet<ContextOmissionReason> = new Set([
  "file_limit",
  "character_limit",
  "token_limit",
]);

export function buildMinimalContext(
  snapshot: ProjectSnapshot,
  budget: ContextBudget,
): MinimalContextPackage {
  const sources = collectContextSources(snapshot);

  const files: ContextFile[] = [];
  const omitted: ContextOmission[] = [];
  const seenAbsolutePaths = new Set<string>();

  let totalCharacters = 0;
  let estimatedTokens = 0;
  let truncated = false;

  for (const source of sources) {
    const resolved = resolveContextPath(snapshot.project.path, source.path);

    if (!resolved.insideProject) {
      omitted.push({ path: source.path, reason: "outside_project" });
      continue;
    }

    if (seenAbsolutePaths.has(resolved.absolutePath)) {
      omitted.push({ path: source.path, reason: "duplicate" });
      continue;
    }
    seenAbsolutePaths.add(resolved.absolutePath);

    let isFile: boolean;
    try {
      isFile = statSync(resolved.absolutePath).isFile();
    } catch {
      isFile = false;
    }

    if (!isFile) {
      omitted.push({ path: source.path, reason: "missing" });
      continue;
    }

    if (files.length >= budget.maxFiles) {
      omitted.push({ path: source.path, reason: "file_limit" });
      continue;
    }

    const content = readFileSync(resolved.absolutePath, "utf8");
    const originalCharacters = content.length;

    const remainingCharacters = budget.maxCharacters - totalCharacters;
    const remainingTokens = budget.maxEstimatedTokens - estimatedTokens;

    if (remainingCharacters <= 0) {
      omitted.push({ path: source.path, reason: "character_limit" });
      continue;
    }
    if (remainingTokens <= 0) {
      omitted.push({ path: source.path, reason: "token_limit" });
      continue;
    }

    if (originalCharacters === 0) {
      files.push({
        path: source.path,
        kind: source.kind,
        content: "",
        originalCharacters: 0,
        includedCharacters: 0,
        estimatedTokens: 0,
        truncated: false,
      });
      continue;
    }

    if (budget.includeFullFiles) {
      // Never partial: the full file is included only if it fits entirely
      // within what's left of both budgets, otherwise it is omitted whole.
      const fullTokens = estimateTokens(content);

      if (originalCharacters > remainingCharacters) {
        omitted.push({ path: source.path, reason: "character_limit" });
        continue;
      }
      if (fullTokens > remainingTokens) {
        omitted.push({ path: source.path, reason: "token_limit" });
        continue;
      }

      files.push({
        path: source.path,
        kind: source.kind,
        content,
        originalCharacters,
        includedCharacters: originalCharacters,
        estimatedTokens: fullTokens,
        truncated: false,
      });
      totalCharacters += originalCharacters;
      estimatedTokens += fullTokens;
      continue;
    }

    // includeFullFiles === false: truncate deterministically to fit both
    // remaining budgets. estimateTokens(s) === Math.ceil(s.length / 4), so a
    // slice of length L keeps its token estimate <= remainingTokens exactly
    // when L <= remainingTokens * 4 (no off-by-one at the boundary).
    const maxCharactersFromTokenBudget = remainingTokens * 4;
    const allowedLength = Math.min(
      originalCharacters,
      remainingCharacters,
      maxCharactersFromTokenBudget,
    );

    const includedContent = content.slice(0, allowedLength);
    const includedCharacters = includedContent.length;
    const fileTokens = estimateTokens(includedContent);
    const isTruncated = includedCharacters < originalCharacters;

    files.push({
      path: source.path,
      kind: source.kind,
      content: includedContent,
      originalCharacters,
      includedCharacters,
      estimatedTokens: fileTokens,
      truncated: isTruncated,
    });

    totalCharacters += includedCharacters;
    estimatedTokens += fileTokens;
    if (isTruncated) {
      truncated = true;
    }
  }

  if (omitted.some((omission) => BUDGET_OMISSION_REASONS.has(omission.reason))) {
    truncated = true;
  }

  return {
    project: snapshot.project.name,
    budget,
    files,
    omitted,
    totalCharacters,
    estimatedTokens,
    truncated,
  };
}
