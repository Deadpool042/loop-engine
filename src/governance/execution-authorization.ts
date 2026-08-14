import { readFileSync } from "node:fs";

import { type ProjectConfig } from "../core/config.js";
import { resolveContextPath } from "../context/path.js";
import { parseExecutionDecisionFile } from "./execution-decision.js";

export type ExecutionAuthorizationBlockedCode =
  | "decision_missing"
  | "decision_malformed"
  | "project_mismatch"
  | "sha_stale"
  | "decision_blocked"
  | "decision_revalidation_required"
  | "decision_no_actionable_work";

export type ExecutionAuthorizationResult =
  | Readonly<{ governed: false }>
  | Readonly<{
      governed: true;
      authorized: true;
      candidateId: string;
    }>
  | Readonly<{
      governed: true;
      authorized: false;
      code: ExecutionAuthorizationBlockedCode;
      reason: string;
    }>;

function blocked(
  code: ExecutionAuthorizationBlockedCode,
  reason: string,
): ExecutionAuthorizationResult {
  return { governed: true, authorized: false, code, reason };
}

// Read-only resolution of the project-owned, SHA-bound execution
// authorization contract (V1). `currentGitHead` is taken explicitly rather
// than derived internally so callers evaluating an isolated context (e.g. a
// worktree) can pass that context's own HEAD instead of an implicit global
// one.
export function resolveExecutionAuthorization(
  project: ProjectConfig,
  projectPath: string,
  currentGitHead: string | null,
): ExecutionAuthorizationResult {
  if (project.execution_decision === undefined) {
    return { governed: false };
  }

  if (
    typeof project.execution_decision !== "string" ||
    project.execution_decision.trim().length === 0
  ) {
    return blocked(
      "decision_malformed",
      "Project execution_decision must be a non-empty string.",
    );
  }

  const resolved = resolveContextPath(projectPath, project.execution_decision);
  if (!resolved.insideProject) {
    return blocked(
      "decision_missing",
      "Execution decision path resolves outside the project.",
    );
  }

  let raw: string;
  try {
    raw = readFileSync(resolved.absolutePath, "utf8");
  } catch {
    return blocked(
      "decision_missing",
      `Execution decision file not found: ${project.execution_decision}`,
    );
  }

  const parsed = parseExecutionDecisionFile(raw);
  if (!parsed.ok) {
    return blocked("decision_malformed", parsed.reason);
  }

  const { decision } = parsed;

  if (decision.project !== project.name) {
    return blocked(
      "project_mismatch",
      `Execution decision declares project "${decision.project}", expected "${project.name}".`,
    );
  }

  switch (decision.decision.state) {
    case "BLOCKED":
      return blocked(
        "decision_blocked",
        decision.decision.reason ?? "Execution decision state is BLOCKED.",
      );
    case "REVALIDATION_REQUIRED":
      return blocked(
        "decision_revalidation_required",
        decision.decision.reason ??
          "Execution decision state is REVALIDATION_REQUIRED.",
      );
    case "NO_ACTIONABLE_WORK":
      return blocked(
        "decision_no_actionable_work",
        decision.decision.reason ??
          "Execution decision state is NO_ACTIONABLE_WORK.",
      );
    case "READY": {
      // Parser guarantees decision.candidate is set when state is READY.
      const candidateId = decision.decision.candidate!.id;

      if (currentGitHead === null || decision.source.gitHead !== currentGitHead) {
        return blocked(
          "sha_stale",
          `Execution decision source.gitHead (${decision.source.gitHead}) does not match the evaluated HEAD (${currentGitHead ?? "unknown"}).`,
        );
      }

      return { governed: true, authorized: true, candidateId };
    }
  }
}
