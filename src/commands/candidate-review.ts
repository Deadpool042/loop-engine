import type { LoopApplicationAssembly } from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

export async function printCandidatePublicationReview(
  application: LoopApplicationAssembly,
  projectName: string,
  runId: string,
  json: boolean,
): Promise<number> {
  const result = await application.reviewCandidatePublication(
    projectName,
    runId,
  );
  if (json) {
    console.log(JSON.stringify(result));
    return result.reviewed ? 0 : 1;
  }
  if (!result.reviewed) {
    terminal.error(`${result.code}: ${result.message}`);
    return 1;
  }
  const { review } = result;
  terminal.header(`Candidate review • ${review.project}`);
  terminal.info(`Run id: ${review.runId}`);
  terminal.info(`Candidate ref: ${review.candidateRef}`);
  terminal.info(`Candidate commit: ${review.candidateCommitSha}`);
  terminal.info(`Base SHA: ${review.baseSha}`);
  terminal.info(`Commit: ${review.commit.subject}`);
  terminal.info(
    `Author: ${review.commit.authorName} (${review.commit.authoredAt})`,
  );
  terminal.section(
    `Changes (${review.additions} additions, ${review.deletions} deletions)`,
  );
  for (const file of review.changedFiles) {
    const additions = file.additions === null ? "binary" : `+${file.additions}`;
    const deletions = file.deletions === null ? "binary" : `-${file.deletions}`;
    terminal.info(`${file.status}: ${file.path} (${additions}, ${deletions})`);
  }
  return 0;
}
