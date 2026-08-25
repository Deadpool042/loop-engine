import { parseExecutionResultDetail } from "./execution-result-contract.js";
import type { DesktopExecutionSession } from "./execution-session.js";
import { readPatchReview, type PatchReviewResult } from "./patch-review.js";

export function createPatchReviewHandler(options: {
  getSession: (sessionId: string) => DesktopExecutionSession | null;
}): (sessionId: unknown) => Promise<PatchReviewResult> {
  return async (sessionId) => {
    if (typeof sessionId !== "string") return { status: "no_patch" };
    const session = options.getSession(sessionId);
    if (session?.result === null || session === null || !session.result.ok)
      return { status: "no_patch" };
    const detail = parseExecutionResultDetail(session.result.json);
    return detail === null
      ? { status: "no_patch" }
      : readPatchReview(detail.patchExport);
  };
}
