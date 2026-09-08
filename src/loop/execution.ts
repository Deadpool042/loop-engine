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
  cwd: string,
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
  repairDiagnostics?: readonly string[];
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

const VALIDATION_DIAGNOSTIC_BUFFER_CHARS = 32_000;
const VALIDATION_DIAGNOSTIC_MAX_LINES = 40;
const VALIDATION_DIAGNOSTIC_MAX_LINE_CHARS = 500;

function sanitizeValidationDiagnostics(
  output: string,
  cwd: string,
): readonly string[] {
  const normalized = output
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replaceAll(cwd, ".")
    .replace(
      /([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s]+@/gi,
      "$1[REDACTED]@",
    )
    .replace(
      /\b([A-Z][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASS|PWD))=([^\s]+)/g,
      "$1=[REDACTED]",
    );

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(-VALIDATION_DIAGNOSTIC_MAX_LINES)
    .map((line) => line.slice(0, VALIDATION_DIAGNOSTIC_MAX_LINE_CHARS));

  return Object.freeze(lines);
}

function runValidationCommand(
  command: string,
  cwd: string,
): Promise<Readonly<{ exitCode: number; diagnostics: readonly string[] }>> {
  return new Promise((resolvePromise) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let settled = false;
    const consume = (chunk: Buffer): void => {
      output += chunk.toString("utf8");
      if (output.length > VALIDATION_DIAGNOSTIC_BUFFER_CHARS) {
        output = output.slice(-VALIDATION_DIAGNOSTIC_BUFFER_CHARS);
      }
    };
    const settle = (exitCode: number): void => {
      if (settled) return;
      settled = true;
      resolvePromise(
        Object.freeze({
          exitCode,
          diagnostics: sanitizeValidationDiagnostics(output, cwd),
        }),
      );
    };

    child.stdout.on("data", consume);
    child.stderr.on("data", consume);
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
    ...(result.diagnostics.length === 0
      ? {}
      : { repairDiagnostics: Object.freeze([...result.diagnostics]) }),
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
