import { resolve } from "node:path";

import type { AgentEffort } from "../agents/types.js";
import { buildClaudeCodeExecutionPrompt } from "./claude-code-cli-executor.js";
import { inspectWorktreeContentPolicy } from "./content-policy.js";
import type { LoopExecutor, LoopExecutorResult } from "./execution.js";
import type { LoopExecutionPlan } from "./execution-plan.js";
import { admitProviderWorktree } from "./provider-worktree-admission.js";
import { readModifiedWorktreeFiles } from "./worktree-status.js";

export type OpenClawAcpClaudeSession = Readonly<{
  sessionKey: string;
  runtimeSessionId?: string;
  backendSessionId?: string;
}>;

export type OpenClawAcpClaudeFailureKind =
  | "auth"
  | "quota"
  | "permission"
  | "runtime"
  | "timeout"
  | "cancelled"
  | "unknown";

export type OpenClawAcpClaudeControl = Readonly<{
  openSession(input: Readonly<{
    runId: string;
    cwd: string;
    agentId: "claude";
    model: string;
    thinking: AgentEffort;
    permissionProfile: string;
    timeoutSeconds: number;
  }>): Promise<
    | Readonly<{ status: "ready"; session: OpenClawAcpClaudeSession }>
    | Readonly<{ status: "failed"; kind: OpenClawAcpClaudeFailureKind }>
  >;
  runTurn(input: Readonly<{
    session: OpenClawAcpClaudeSession;
    prompt: string;
  }>): Promise<
    | Readonly<{
        status: "completed";
        runtime: "acp";
        provider: string;
        model: string;
      }>
    | Readonly<{
        status: "failed" | "timeout" | "cancelled";
        kind: OpenClawAcpClaudeFailureKind;
      }>
  >;
  cancel(input: Readonly<{ session: OpenClawAcpClaudeSession }>): Promise<boolean>;
  close(input: Readonly<{ session: OpenClawAcpClaudeSession }>): Promise<boolean>;
}>;

export type OpenClawAcpClaudeLoopExecutorOptions = Readonly<{
  control: OpenClawAcpClaudeControl;
  permissionProfile?: string;
  timeoutMs?: number;
}>;

function failure(
  code: string,
  message: string,
  modifiedFiles: readonly string[] = [],
): LoopExecutorResult {
  return Object.freeze({
    status: "failed" as const,
    modifiedFiles: Object.freeze([...modifiedFiles]),
    failure: Object.freeze({
      code,
      message,
      details: Object.freeze([
        "OpenClaw ACP/Claude control diagnostics are redacted.",
      ]),
    }),
  });
}

function mapFailureKind(kind: OpenClawAcpClaudeFailureKind): Readonly<{
  code: string;
  message: string;
}> {
  switch (kind) {
    case "auth":
      return Object.freeze({
        code: "provider_unavailable",
        message: "Claude ACP authentication is unavailable.",
      });
    case "quota":
      return Object.freeze({
        code: "provider_limit_exceeded",
        message: "Claude ACP subscription quota or rate limit was reached.",
      });
    case "permission":
      return Object.freeze({
        code: "provider_permission_denied",
        message: "Claude ACP could not proceed under the configured permission profile.",
      });
    case "runtime":
      return Object.freeze({
        code: "runtime_unavailable",
        message: "OpenClaw ACP/Claude runtime is unavailable.",
      });
    case "timeout":
      return Object.freeze({
        code: "provider_timeout",
        message: "Claude ACP execution exceeded the configured timeout.",
      });
    case "cancelled":
      return Object.freeze({
        code: "provider_cancelled",
        message: "Claude ACP execution was cancelled.",
      });
    default:
      return Object.freeze({
        code: "provider_failed",
        message: "Claude ACP execution failed.",
      });
  }
}

export function createOpenClawAcpClaudeLoopExecutor(
  options: OpenClawAcpClaudeLoopExecutorOptions,
): LoopExecutor {
  const timeoutMs = options.timeoutMs ?? 600_000;
  const permissionProfile = options.permissionProfile?.trim() || "strict";
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Claude ACP timeout must be a positive integer.");
  }
  if (!permissionProfile) {
    throw new TypeError("Claude ACP permission profile must be non-empty.");
  }

  return async (
    plan: LoopExecutionPlan,
    executionCwd: string,
  ): Promise<LoopExecutorResult> => {
    if (plan.provider !== "anthropic" || plan.runtime !== "openclaw") {
      return failure(
        "execution_plan_provider_mismatch",
        "The execution plan is not assigned to the OpenClaw ACP Claude runtime.",
      );
    }

    const cwd = resolve(executionCwd);
    const before = await readModifiedWorktreeFiles(cwd);
    if (before === null) {
      return failure(
        "worktree_status_failed",
        "Unable to verify the provider worktree.",
      );
    }
    const admission = admitProviderWorktree(plan, before);
    if (!admission.ok) {
      return failure(admission.code, admission.message, before);
    }

    const opened = await options.control.openSession({
      runId: plan.runId,
      cwd,
      agentId: "claude",
      model: plan.model,
      thinking: plan.effort,
      permissionProfile,
      timeoutSeconds: Math.max(1, Math.ceil(timeoutMs / 1000)),
    });
    if (opened.status === "failed") {
      const mapped = mapFailureKind(opened.kind);
      return failure(mapped.code, mapped.message, before);
    }

    const session = opened.session;
    let turn:
      | Awaited<ReturnType<OpenClawAcpClaudeControl["runTurn"]>>
      | null = null;
    let cleanupOk = false;
    try {
      turn = await options.control.runTurn({
        session,
        prompt: buildClaudeCodeExecutionPrompt(plan),
      });
      if (turn.status === "timeout" || turn.status === "cancelled") {
        await options.control.cancel({ session });
      }
    } finally {
      cleanupOk = await options.control.close({ session });
    }

    const modifiedFiles = await readModifiedWorktreeFiles(cwd);
    if (modifiedFiles === null) {
      return failure(
        "worktree_status_failed",
        "Unable to inspect provider modifications.",
      );
    }
    if (!cleanupOk) {
      return failure(
        "runtime_cleanup_failed",
        "OpenClaw ACP Claude session cleanup did not complete.",
        modifiedFiles,
      );
    }
    if (turn === null) {
      return failure(
        "provider_failed",
        "Claude ACP did not return a terminal result.",
        modifiedFiles,
      );
    }
    if (turn.status !== "completed") {
      const mapped = mapFailureKind(turn.kind);
      return failure(mapped.code, mapped.message, modifiedFiles);
    }
    if (
      turn.runtime !== "acp" ||
      turn.provider !== "anthropic" ||
      turn.model !== plan.model
    ) {
      return failure(
        "execution_plan_model_mismatch",
        "OpenClaw ACP execution did not use the runtime/provider/model selected by the execution plan.",
        modifiedFiles,
      );
    }

    const contentPolicy = await inspectWorktreeContentPolicy(
      plan,
      cwd,
      modifiedFiles,
    );
    if (contentPolicy.outcome === "violation") {
      return failure(
        "content_policy_violation",
        "Generated content violates the governed mission constraints.",
        modifiedFiles,
      );
    }
    if (contentPolicy.outcome === "uninspectable") {
      return failure(
        "content_policy_inspection_failed",
        "Generated content could not be verified against the governed mission constraints.",
        modifiedFiles,
      );
    }

    return Object.freeze({
      status: "completed" as const,
      modifiedFiles,
      details: Object.freeze([
        `OpenClaw ACP Claude completed execution plan for ${plan.profileId} (${plan.model}).`,
        `ACP session: ${session.sessionKey}.`,
      ]),
    });
  };
}
