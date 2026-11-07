import {
  CANCELLATION_CLEANUP_FAILED_CODE,
  EXECUTION_CANCELLED_CODE,
} from "./cancellation.js";
import type { LoopExecutionPlan } from "./execution-plan.js";
import type { LoopExecutor, LoopExecutorResult } from "./execution.js";
import type { LoopRunFailure } from "./types.js";

export const LOOP_PROVIDER_FAILOVER_SCHEMA_VERSION = 1 as const;

export type LoopProviderFailoverAttempt = Readonly<{
  plan: LoopExecutionPlan;
  executor: LoopExecutor;
}>;

export type LoopProviderFailoverAttemptEvidence = Readonly<{
  attempt: number;
  provider: string;
  runtime: string;
  profileId: string;
  model: string;
  status: "completed" | "failed";
  failureCode: string | null;
  recoverable: boolean;
}>;

export type LoopProviderFailoverEvidence = Readonly<{
  schemaVersion: typeof LOOP_PROVIDER_FAILOVER_SCHEMA_VERSION;
  maxAttempts: number;
  attemptedProviders: readonly string[];
  selectedProvider: string | null;
  attempts: readonly LoopProviderFailoverAttemptEvidence[];
}>;

export type LoopProviderFailoverResult = Readonly<{
  result: LoopExecutorResult;
  evidence: LoopProviderFailoverEvidence;
}>;

export type LoopProviderFailureClassifier = (
  failure: LoopRunFailure,
  attempt: Readonly<{ plan: LoopExecutionPlan; attempt: number }>,
) => boolean;

export type LoopProviderWorkspaceReset = () => Promise<void>;
export type LoopProviderWorkspaceResetFactory = (
  cwd: string,
) => Promise<LoopProviderWorkspaceReset>;

export type LoopProviderFailoverOptions = Readonly<{
  attempts: readonly LoopProviderFailoverAttempt[];
  maxAttempts: number;
  cwd: string;
  isRecoverableFailure?: LoopProviderFailureClassifier;
  createWorkspaceReset?: LoopProviderWorkspaceResetFactory;
  /**
   * Cooperative cancellation request (L7). Once aborted no further provider is
   * attempted and no workspace reset is run: failover never turns a
   * cancellation into a fallback.
   */
  signal?: AbortSignal;
}>;

const DEFAULT_RECOVERABLE_FAILURE_CODES = new Set([
  "executor_unavailable",
  "provider_unavailable",
  "provider_rate_limited",
  "provider_timeout",
  "provider_limit_exceeded",
  "provider_max_turns",
  "runtime_unavailable",
]);

function defaultFailureClassifier(failure: LoopRunFailure): boolean {
  return DEFAULT_RECOVERABLE_FAILURE_CODES.has(failure.code);
}

function fail(
  code: string,
  message: string,
  detail: string,
): LoopExecutorResult {
  return Object.freeze({
    status: "failed" as const,
    modifiedFiles: Object.freeze([]),
    failure: Object.freeze({
      code,
      message,
      details: Object.freeze([detail]),
    }),
  });
}

function isValidAttemptBudget(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function validateAttempts(
  attempts: readonly LoopProviderFailoverAttempt[],
): LoopExecutorResult | null {
  if (attempts.length === 0) {
    return fail(
      "provider_attempts_empty",
      "At least one provider attempt is required.",
      "No provider execution attempt was supplied.",
    );
  }

  const executionTargets = new Set<string>();
  for (const attempt of attempts) {
    const provider = attempt.plan.provider.trim();
    const runtime = attempt.plan.runtime.trim();
    if (provider.length === 0 || runtime.length === 0) {
      return fail(
        "provider_attempt_invalid",
        "Provider attempts require non-empty provider and runtime ids.",
        "An execution plan exposed an empty provider or runtime id.",
      );
    }
    const executionTarget = `${provider}/${runtime}`;
    if (executionTargets.has(executionTarget)) {
      return fail(
        "provider_attempt_duplicate",
        "Provider failover cannot attempt the same provider/runtime target twice.",
        `Duplicate execution target: ${executionTarget}`,
      );
    }
    executionTargets.add(executionTarget);
  }

  return null;
}

function freezeEvidence(
  maxAttempts: number,
  attempts: readonly LoopProviderFailoverAttemptEvidence[],
  selectedProvider: string | null,
): LoopProviderFailoverEvidence {
  return Object.freeze({
    schemaVersion: LOOP_PROVIDER_FAILOVER_SCHEMA_VERSION,
    maxAttempts,
    attemptedProviders: Object.freeze(
      attempts.map((attempt) => attempt.provider),
    ),
    selectedProvider,
    attempts: Object.freeze([...attempts]),
  });
}

/**
 * Executes an ordered sequence of provider-specific plans. Each plan remains
 * indivisible from its executor, preventing a fallback provider from executing
 * under the identity, model or policy evidence of the primary provider.
 */
export async function executeLoopProviderFailover(
  options: LoopProviderFailoverOptions,
): Promise<LoopProviderFailoverResult> {
  if (!isValidAttemptBudget(options.maxAttempts)) {
    const result = fail(
      "invalid_provider_attempt_budget",
      "maxAttempts must be a positive integer.",
      String(options.maxAttempts),
    );
    return Object.freeze({
      result,
      evidence: freezeEvidence(0, [], null),
    });
  }

  const boundedAttempts = options.attempts.slice(0, options.maxAttempts);
  const validationFailure = validateAttempts(boundedAttempts);
  if (validationFailure) {
    return Object.freeze({
      result: validationFailure,
      evidence: freezeEvidence(options.maxAttempts, [], null),
    });
  }

  const classifier = options.isRecoverableFailure ?? defaultFailureClassifier;
  const evidence: LoopProviderFailoverAttemptEvidence[] = [];
  const modifiedFiles = new Set<string>();
  let resetWorkspace: LoopProviderWorkspaceReset | null = null;
  let resetPreparationFailed = false;

  if (
    boundedAttempts.length > 1 &&
    options.createWorkspaceReset !== undefined
  ) {
    try {
      resetWorkspace = await options.createWorkspaceReset(options.cwd);
    } catch {
      resetPreparationFailed = true;
    }
  }

  // A function call, not a property read: TypeScript would otherwise narrow
  // `signal.aborted` to `false` after the first check although it can change
  // while an executor is awaited.
  const isAborted = (): boolean => options.signal?.aborted === true;
  const cancelled = (): LoopProviderFailoverResult =>
    Object.freeze({
      result: Object.freeze({
        status: "failed" as const,
        modifiedFiles: Object.freeze([...modifiedFiles].sort()),
        failure: Object.freeze({
          code: EXECUTION_CANCELLED_CODE,
          message: "Provider failover was cancelled.",
          details: Object.freeze(["No further provider attempt was started."]),
        }),
      }),
      evidence: freezeEvidence(options.maxAttempts, evidence, null),
    });

  for (const [index, attempt] of boundedAttempts.entries()) {
    const attemptNumber = index + 1;
    let result: LoopExecutorResult;

    if (isAborted()) return cancelled();
    try {
      result = await attempt.executor(
        attempt.plan,
        options.cwd,
        options.signal === undefined ? {} : { signal: options.signal },
      );
    } catch {
      result = fail(
        "provider_executor_exception",
        "A provider executor threw an error.",
        "Provider exception details were redacted.",
      );
    }

    for (const file of result.modifiedFiles) {
      const normalized = file.trim();
      if (normalized.length > 0) modifiedFiles.add(normalized);
    }

    if (isAborted()) {
      // Cancelled attempts are recorded as non-recoverable failures; a cleanup
      // failure reported by the provider is surfaced, never masked.
      evidence.push(
        Object.freeze({
          attempt: attemptNumber,
          provider: attempt.plan.provider,
          runtime: attempt.plan.runtime,
          profileId: attempt.plan.profileId,
          model: attempt.plan.model,
          status: "failed" as const,
          failureCode:
            result.status === "failed"
              ? result.failure.code
              : EXECUTION_CANCELLED_CODE,
          recoverable: false,
        }),
      );
      if (
        result.status === "failed" &&
        result.failure.code === CANCELLATION_CLEANUP_FAILED_CODE
      ) {
        return Object.freeze({
          result: Object.freeze({
            ...result,
            modifiedFiles: Object.freeze([...modifiedFiles].sort()),
          }),
          evidence: freezeEvidence(options.maxAttempts, evidence, null),
        });
      }
      return cancelled();
    }

    if (result.status === "completed") {
      evidence.push(
        Object.freeze({
          attempt: attemptNumber,
          provider: attempt.plan.provider,
          runtime: attempt.plan.runtime,
          profileId: attempt.plan.profileId,
          model: attempt.plan.model,
          status: "completed" as const,
          failureCode: null,
          recoverable: false,
        }),
      );

      return Object.freeze({
        result: Object.freeze({
          status: "completed" as const,
          modifiedFiles: Object.freeze([...modifiedFiles].sort()),
          details: Object.freeze([
            ...result.details,
            `Provider failover selected ${attempt.plan.provider} on attempt ${attemptNumber}.`,
          ]),
        }),
        evidence: freezeEvidence(
          options.maxAttempts,
          evidence,
          attempt.plan.provider,
        ),
      });
    }

    const recoverable = classifier(result.failure, {
      plan: attempt.plan,
      attempt: attemptNumber,
    });
    evidence.push(
      Object.freeze({
        attempt: attemptNumber,
        provider: attempt.plan.provider,
        runtime: attempt.plan.runtime,
        profileId: attempt.plan.profileId,
        model: attempt.plan.model,
        status: "failed" as const,
        failureCode: result.failure.code,
        recoverable,
      }),
    );

    const hasNextAttempt = attemptNumber < boundedAttempts.length;
    if (!recoverable || !hasNextAttempt) {
      return Object.freeze({
        result: Object.freeze({
          status: "failed" as const,
          modifiedFiles: Object.freeze([...modifiedFiles].sort()),
          failure: Object.freeze({
            code: result.failure.code,
            message: result.failure.message,
            details: Object.freeze([
              ...result.failure.details,
              `Provider attempts used: ${attemptNumber}/${options.maxAttempts}.`,
            ]),
          }),
        }),
        evidence: freezeEvidence(options.maxAttempts, evidence, null),
      });
    }

    if (resetPreparationFailed) {
      return Object.freeze({
        result: fail(
          "provider_failover_workspace_reset_failed",
          "Provider failover could not prepare a clean baseline for the next attempt.",
          "Workspace reset preparation diagnostics were redacted.",
        ),
        evidence: freezeEvidence(options.maxAttempts, evidence, null),
      });
    }
    if (resetWorkspace === null) {
      return Object.freeze({
        result: fail(
          "provider_failover_workspace_reset_unavailable",
          "Provider failover requires an explicit workspace reset before the next attempt.",
          "No workspace reset callback was configured.",
        ),
        evidence: freezeEvidence(options.maxAttempts, evidence, null),
      });
    }

    try {
      await resetWorkspace();
    } catch {
      return Object.freeze({
        result: fail(
          "provider_failover_workspace_reset_failed",
          "Provider failover could not restore the clean baseline before the next attempt.",
          "Workspace reset diagnostics were redacted.",
        ),
        evidence: freezeEvidence(options.maxAttempts, evidence, null),
      });
    }
    modifiedFiles.clear();
  }

  const exhausted = fail(
    "provider_attempts_exhausted",
    "Provider failover exhausted its bounded attempts.",
    `Attempt budget: ${options.maxAttempts}`,
  );
  return Object.freeze({
    result: exhausted,
    evidence: freezeEvidence(options.maxAttempts, evidence, null),
  });
}

/** Creates a LoopExecutor compatible facade over provider-specific attempts. */
export function createProviderFailoverLoopExecutor(
  resolveAttempts: (
    primaryPlan: LoopExecutionPlan,
  ) => readonly LoopProviderFailoverAttempt[],
  options: Readonly<{
    maxAttempts: number;
    isRecoverableFailure?: LoopProviderFailureClassifier;
    createWorkspaceReset?: LoopProviderWorkspaceResetFactory;
  }>,
): LoopExecutor {
  return async (primaryPlan, cwd, context) => {
    const attempts = resolveAttempts(primaryPlan);
    if (attempts[0]?.plan !== primaryPlan) {
      return fail(
        "provider_primary_plan_mismatch",
        "The first failover attempt must preserve the admitted primary plan.",
        "The resolver replaced or reordered the primary execution plan.",
      );
    }

    const outcome = await executeLoopProviderFailover({
      attempts,
      maxAttempts: options.maxAttempts,
      cwd,
      ...(context?.signal === undefined ? {} : { signal: context.signal }),
      ...(options.isRecoverableFailure === undefined
        ? {}
        : { isRecoverableFailure: options.isRecoverableFailure }),
      ...(options.createWorkspaceReset === undefined
        ? {}
        : { createWorkspaceReset: options.createWorkspaceReset }),
    });
    return outcome.result;
  };
}
