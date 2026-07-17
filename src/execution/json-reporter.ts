import { createExecutionSummary } from "./summary.js";
import type {
  ExecutionResult,
  ExecutionStepResult,
} from "./types.js";

export interface ExecutionJsonStep {
  readonly name: string;
  readonly status: "success" | "failed";
  readonly startedAt: string;
  readonly completedAt: string;
  readonly detailCount: number;
  readonly details: readonly string[];
}

export interface ExecutionJsonReport {
  readonly schemaVersion: 1;
  readonly summary: {
    readonly sessionId: string;
    readonly status: string;
    readonly startedAt: string;
    readonly completedAt: string | null;
    readonly stepCount: number;
    readonly succeeded: number;
    readonly failed: number;
  };
  readonly steps: readonly ExecutionJsonStep[];
}

function createExecutionJsonStep(
  step: ExecutionStepResult,
): ExecutionJsonStep {
  return Object.freeze({
    name: step.name,
    status: step.success ? "success" : "failed",
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    detailCount: step.details.length,
    details: Object.freeze([...step.details]),
  });
}

export function createExecutionJsonReport(
  result: ExecutionResult,
): ExecutionJsonReport {
  const summary = createExecutionSummary(result);

  return Object.freeze({
    schemaVersion: 1,
    summary,
    steps: Object.freeze(result.steps.map(createExecutionJsonStep)),
  });
}

export function renderExecutionJson(
  result: ExecutionResult,
): string {
  return JSON.stringify(createExecutionJsonReport(result), null, 2);
}
