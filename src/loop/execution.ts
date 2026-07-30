import { spawn } from "node:child_process";

import type { MinimalContextPackage } from "../context/types.js";
import type { ProjectConfig } from "../core/config.js";
import { runConfiguredValidations } from "../core/reports.js";
import type { RoadmapCandidate } from "../intelligence/roadmap.js";
import type { AgentPolicyResolution } from "../policy/types.js";
import type { LoopExecutionPlan } from "./execution-plan.js";
import type { LoopProviderFailoverEvidence } from "./provider-failover.js";
import type { LoopRunFailure } from "./types.js";

/** Compatibility name retained for callers; the executor now receives only the plan. */
export type LoopExecutorInput = LoopExecutionPlan;

type LoopExecutorEvidence = Readonly<{
  providerFailoverEvidence?: LoopProviderFailoverEvidence;
}>;

export type LoopExecutorResult =
  | (Readonly<{
      status: "completed";
      modifiedFiles: readonly string[];
      details: readonly string[];
    }> &
      LoopExecutorEvidence)
  | (Readonly<{
      status: "failed";
      modifiedFiles: readonly string[];
      failure: LoopRunFailure;
    }> &
      LoopExecutorEvidence);

export type LoopExecutor = (
  plan: LoopExecutionPlan,
) => Promise<LoopExecutorResult>;

export type LoopValidatorInput = Readonly<{
  runId: string;
  project: ProjectConfig;
  candidate: RoadmapCandidate;
  modifiedFiles: readonly string[];
  attempt: number;
}>;

export type LoopValidatorResult = Readonly<{
  status: "passed" | "failed";
  failedCommand: string | null;
  exitCode: number;
  details: readonly string[];
}>;

export type LoopValidator = (
  input: LoopValidatorInput,
) => Promise<LoopValidatorResult>;

export type LoopRepairerInput = Readonly<{
  runId: string;
  project: ProjectConfig;
  candidate: RoadmapCandidate;
  agentPolicy: AgentPolicyResolution;
  contextPackage: MinimalContextPackage;
  modifiedFiles: readonly string[];
  validation: LoopValidatorResult;
  attempt: number;
  maxRepairs: number;
}>;

export type LoopRepairerResult =
  | Readonly<{
      status: "completed";
      modifiedFiles: readonly string[];
      details: readonly string[];
    }>
  | Readonly<{
      status: "failed";
      modifiedFiles: readonly string[];
      failure: LoopRunFailure;
    }>;

export type LoopRepairer = (
  input: LoopRepairerInput,
) => Promise<LoopRepairerResult>;

function runValidationCommand(command: string, cwd: string): Promise<number> {
  return new Promise<number>((resolvePromise) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "ignore", "ignore"],
    });

    let settled = false;
    const settle = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      resolvePromise(exitCode);
    };

    child.once("error", () => settle(1));
    child.once("close", (code) => settle(code ?? 1));
  });
}

/** Default validator adapter: composes the existing configured-validation runner. */
export async function validateLoopExecution(
  input: LoopValidatorInput,
): Promise<LoopValidatorResult> {
  const result = await runConfiguredValidations(
    input.project,
    runValidationCommand,
  );

  return Object.freeze({
    status: result.failedCommand === null ? "passed" : "failed",
    failedCommand: result.failedCommand,
    exitCode: result.exitCode,
    details: Object.freeze(
      result.failedCommand === null
        ? [`Validation attempt ${input.attempt} passed.`]
        : [
            `Validation attempt ${input.attempt} failed.`,
            `Failed command: ${result.failedCommand}`,
          ],
    ),
  });
}

/** Fail-closed CLI default until a concrete provider adapter is injected. */
export async function unavailableLoopExecutor(): Promise<LoopExecutorResult> {
  return Object.freeze({
    status: "failed",
    modifiedFiles: Object.freeze([]),
    failure: Object.freeze({
      code: "executor_unavailable",
      message: "No LoopExecutor is configured for execute mode.",
      details: Object.freeze([
        "Inject a reviewed LoopExecutor implementation before requesting execution.",
      ]),
    }),
  });
}
