import type { ProjectConfig } from "../core/config.js";
import { resolveExecutionAuthorization } from "../governance/execution-authorization.js";

export type AutoSubscriptionAdmission =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      code:
        | "auto_subscription_requires_execution_decision"
        | "auto_subscription_authorization_blocked"
        | "auto_subscription_candidate_mismatch"
        | "auto_subscription_requires_brief";
      message: string;
    }>;

/**
 * AUTO execution is intentionally stricter than ordinary explicit execution.
 * A facade may only start a project-owned, SHA-bound mission with an explicit
 * writable scope and brief. This prevents broad roadmap prose from consuming
 * subscription quota without a machine-executable contract.
 */
export function evaluateAutoSubscriptionAdmission(
  project: ProjectConfig,
  currentGitHead: string,
  candidateId: string,
): AutoSubscriptionAdmission {
  const authorization = resolveExecutionAuthorization(
    project,
    project.path,
    currentGitHead,
  );

  if (!authorization.governed) {
    return Object.freeze({
      ok: false as const,
      code: "auto_subscription_requires_execution_decision" as const,
      message:
        "Autonomous subscription execution requires a project-owned execution decision.",
    });
  }

  if (!authorization.authorized) {
    return Object.freeze({
      ok: false as const,
      code: "auto_subscription_authorization_blocked" as const,
      message: `Autonomous subscription execution is blocked by the execution decision (${authorization.code}).`,
    });
  }

  if (authorization.candidateId !== candidateId) {
    return Object.freeze({
      ok: false as const,
      code: "auto_subscription_candidate_mismatch" as const,
      message:
        "Autonomous subscription execution candidate does not match the execution decision.",
    });
  }

  if (authorization.brief === undefined) {
    return Object.freeze({
      ok: false as const,
      code: "auto_subscription_requires_brief" as const,
      message:
        "Autonomous subscription execution requires an explicit mission brief.",
    });
  }

  return Object.freeze({ ok: true as const });
}
