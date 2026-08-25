import type { LoopRunResult } from "../loop/types.js";
import {
  gitCandidateReviewer,
  type CandidateReviewResult,
  type CandidateReviewer,
} from "../loop/git-candidate-reviewer.js";
import { findProject } from "../core/project.js";
import { generateRunHistoryReport } from "../core/reports.js";
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
    generateRunHistoryReport?: typeof generateRunHistoryReport;
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
    const history = (
      options.generateRunHistoryReport ?? generateRunHistoryReport
    )(projectName, { limit: 100 });
    const publication = publicationForRun(
      history.entries.find((entry) => entry.runId === runId),
      projectName,
      runId,
    );
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
