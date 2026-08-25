import type { LoopRunResult } from "../loop/types.js";
import {
  gitCandidateReviewer,
  type CandidateReviewResult,
  type CandidateReviewer,
} from "../loop/git-candidate-reviewer.js";
import { findProject } from "../core/project.js";
import { lookupRunHistoryEntry } from "../core/run-history-lookup.js";
import { loadConfig } from "../core/config.js";

export type CandidatePublicationReview = (
  projectName: string,
  runId: string,
) => Promise<CandidateReviewResult>;

function publicationForRun(
  run: LoopRunResult | undefined,
  projectName: string,
  runId: string,
) {
  if (
    !run ||
    run.project !== projectName ||
    run.runId !== runId ||
    run.mode !== "publish" ||
    run.status !== "completed" ||
    run.publication === null ||
    run.publication.kind !== "candidate_ref"
  )
    return null;
  return run.publication;
}

/**
 * Resolves the candidate identity only from the existing Run History record.
 * A caller cannot supply a ref, SHA, path, cwd, or Git arguments.
 */
export function createCandidatePublicationReview(
  options: Readonly<{
    loadConfig?: typeof loadConfig;
    findProject?: typeof findProject;
    lookupRunHistoryEntry?: typeof lookupRunHistoryEntry;
    candidateReviewer?: CandidateReviewer;
  }> = {},
): CandidatePublicationReview {
  return async (projectName, runId) => {
    const project = (options.findProject ?? findProject)(
      (options.loadConfig ?? loadConfig)(),
      projectName,
    );
    if (!project)
      return Object.freeze({
        reviewed: false as const,
        code: "unknown_project",
        message: "The project could not be resolved for candidate review.",
      });

    const lookup = (options.lookupRunHistoryEntry ?? lookupRunHistoryEntry)(
      projectName,
      runId,
    );
    if (!lookup.found) {
      if (lookup.code === "duplicate_run_id") {
        return Object.freeze({
          reviewed: false as const,
          code: "candidate_run_ambiguous",
          message: "Multiple Run History entries share this candidate run id.",
        });
      }
      if (
        lookup.code === "invalid_project_identity" ||
        lookup.code === "read_failed"
      ) {
        return Object.freeze({
          reviewed: false as const,
          code: "candidate_run_lookup_failed",
          message: "Candidate Run History evidence could not be inspected.",
        });
      }
      return Object.freeze({
        reviewed: false as const,
        code: "candidate_run_not_found",
        message: "No completed candidate publication was found for this run.",
      });
    }

    const publication = publicationForRun(lookup.entry, projectName, runId);
    if (!publication)
      return Object.freeze({
        reviewed: false as const,
        code: "candidate_run_not_found",
        message: "No completed candidate publication was found for this run.",
      });
    return (options.candidateReviewer ?? gitCandidateReviewer)({
      project,
      runId,
      publication,
    });
  };
}
