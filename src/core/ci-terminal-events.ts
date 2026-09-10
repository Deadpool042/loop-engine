import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

import { resolveLoopEngineStatePath } from "./runtime-state.js";

export type CiTerminalConclusion = "success" | "failure" | "cancelled";
export type CiTerminalEventType = "ci.green" | "ci.failed";

export type CiTerminalEventRecord = Readonly<{
  schemaVersion: 1;
  project: string;
  repository: string;
  sha: string;
  conclusion: CiTerminalConclusion;
  workflow: string;
  runId: string;
  runAttempt: number;
  runUrl: string;
  prNumber: number | null;
  branch: string | null;
  occurredAt: string;
}>;

export const CI_EVENT_DIRECTORY = resolveLoopEngineStatePath("ci-events");
const PROJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const WORKFLOW_PATTERN = /^[^\r\n]{1,160}$/;
const BRANCH_PATTERN = /^[A-Za-z0-9._\/-]{1,240}$/;
const RUN_ID_PATTERN = /^[0-9]{1,30}$/;

function isConclusion(value: unknown): value is CiTerminalConclusion {
  return value === "success" || value === "failure" || value === "cancelled";
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function assertRecord(record: CiTerminalEventRecord): void {
  if (record.schemaVersion !== 1) throw new Error("invalid_schema_version");
  if (!PROJECT_PATTERN.test(record.project)) throw new Error("invalid_project");
  if (!REPOSITORY_PATTERN.test(record.repository)) throw new Error("invalid_repository");
  if (!SHA_PATTERN.test(record.sha)) throw new Error("invalid_sha");
  if (!isConclusion(record.conclusion)) throw new Error("invalid_conclusion");
  if (!WORKFLOW_PATTERN.test(record.workflow)) throw new Error("invalid_workflow");
  if (!RUN_ID_PATTERN.test(record.runId)) throw new Error("invalid_run_id");
  if (!Number.isInteger(record.runAttempt) || record.runAttempt < 1 || record.runAttempt > 9999) {
    throw new Error("invalid_run_attempt");
  }
  if (
    record.runUrl !==
    `https://github.com/${record.repository}/actions/runs/${record.runId}`
  ) {
    throw new Error("invalid_run_url");
  }
  if (
    record.prNumber !== null &&
    (!Number.isInteger(record.prNumber) || record.prNumber < 1 || record.prNumber > 999999999)
  ) {
    throw new Error("invalid_pr_number");
  }
  if (record.branch !== null && !BRANCH_PATTERN.test(record.branch)) {
    throw new Error("invalid_branch");
  }
  if (!isIsoDate(record.occurredAt)) throw new Error("invalid_occurred_at");
}

export function resolveCiTerminalEventPath(
  project: string,
  directory: string = CI_EVENT_DIRECTORY,
): string {
  if (!PROJECT_PATTERN.test(project)) throw new Error("invalid_project");
  return join(directory, `${project}.json`);
}

export function recordCiTerminalEvent(
  record: CiTerminalEventRecord,
  directory: string = CI_EVENT_DIRECTORY,
): Readonly<{ ok: true; path: string }> {
  assertRecord(record);
  const path = resolveCiTerminalEventPath(record.project, directory);
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
  );
  writeFileSync(temporaryPath, `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
  return Object.freeze({ ok: true as const, path });
}

export function readCiTerminalEvent(
  project: string,
  directory: string = CI_EVENT_DIRECTORY,
): CiTerminalEventRecord | null {
  const path = resolveCiTerminalEventPath(project, directory);
  if (!existsSync(path)) return null;

  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as CiTerminalEventRecord;
  assertRecord(parsed);
  if (parsed.project !== project) throw new Error("project_identity_mismatch");
  return Object.freeze({ ...parsed });
}

export function ciTerminalEventType(
  conclusion: CiTerminalConclusion,
): CiTerminalEventType {
  return conclusion === "success" ? "ci.green" : "ci.failed";
}
