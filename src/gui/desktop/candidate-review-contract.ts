const SHA = /^[a-f0-9]{40}$/;
const STATUSES = new Set(["added", "modified", "deleted"]);

export type CandidateReviewFile = Readonly<{
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number | null;
  deletions: number | null;
}>;

export type CandidateReviewDetail = Readonly<{
  project: string;
  runId: string;
  candidateRef: string;
  candidateCommitSha: string;
  baseSha: string;
  commit: Readonly<{
    subject: string;
    authorName: string;
    authoredAt: string;
  }>;
  changedFiles: readonly CandidateReviewFile[];
  additions: number;
  deletions: number;
}>;

export type CandidateReviewResponse =
  | Readonly<{ reviewed: true; review: CandidateReviewDetail }>
  | Readonly<{ reviewed: false; code: string; message: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseNullableCount(value: unknown): number | null | undefined {
  return value === null ? null : isCount(value) ? value : undefined;
}

export function parseCandidateReviewResponse(
  value: unknown,
): CandidateReviewResponse | null {
  if (!isRecord(value) || typeof value.reviewed !== "boolean") return null;
  if (!value.reviewed) {
    if (typeof value.code !== "string" || typeof value.message !== "string") {
      return null;
    }
    return Object.freeze({
      reviewed: false,
      code: value.code,
      message: value.message,
    });
  }

  const review = value.review;
  if (
    !isRecord(review) ||
    review.schemaVersion !== 1 ||
    typeof review.project !== "string" ||
    typeof review.runId !== "string" ||
    typeof review.candidateRef !== "string" ||
    typeof review.candidateCommitSha !== "string" ||
    !SHA.test(review.candidateCommitSha) ||
    typeof review.baseSha !== "string" ||
    !SHA.test(review.baseSha) ||
    !isRecord(review.commit) ||
    typeof review.commit.subject !== "string" ||
    typeof review.commit.authorName !== "string" ||
    typeof review.commit.authoredAt !== "string" ||
    !Array.isArray(review.changedFiles) ||
    !isCount(review.additions) ||
    !isCount(review.deletions)
  ) {
    return null;
  }

  const expectedRef = `refs/loop-engine/candidates/${review.project}/${review.runId}`;
  if (review.candidateRef !== expectedRef) return null;

  const changedFiles: CandidateReviewFile[] = [];
  for (const candidate of review.changedFiles) {
    if (
      !isRecord(candidate) ||
      typeof candidate.path !== "string" ||
      candidate.path.length === 0 ||
      typeof candidate.status !== "string" ||
      !STATUSES.has(candidate.status)
    ) {
      return null;
    }
    const additions = parseNullableCount(candidate.additions);
    const deletions = parseNullableCount(candidate.deletions);
    if (additions === undefined || deletions === undefined) return null;
    changedFiles.push(
      Object.freeze({
        path: candidate.path,
        status: candidate.status as CandidateReviewFile["status"],
        additions,
        deletions,
      }),
    );
  }

  return Object.freeze({
    reviewed: true,
    review: Object.freeze({
      project: review.project,
      runId: review.runId,
      candidateRef: review.candidateRef,
      candidateCommitSha: review.candidateCommitSha,
      baseSha: review.baseSha,
      commit: Object.freeze({
        subject: review.commit.subject,
        authorName: review.commit.authorName,
        authoredAt: review.commit.authoredAt,
      }),
      changedFiles: Object.freeze(changedFiles),
      additions: review.additions,
      deletions: review.deletions,
    }),
  });
}
