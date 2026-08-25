import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";

import { LOOP_RUN_STATUSES, type LoopRunResult } from "../loop/types.js";
import {
  InvalidRunHistoryProjectIdentityError,
  isTerminalLoopRunResult,
  resolveRunHistoryFilePath,
} from "./run-history.js";

const RUN_HISTORY_LOOKUP_CHUNK_BYTES = 64 * 1024;

export type LoopRunHistoryLookupResult =
  | Readonly<{
      found: true;
      entry: LoopRunResult;
      corruptedLines: number;
    }>
  | Readonly<{
      found: false;
      code:
        | "not_found"
        | "duplicate_run_id"
        | "invalid_project_identity"
        | "read_failed";
      corruptedLines: number;
    }>;

function isKnownRunHistoryEntry(
  value: unknown,
  expectedProject: string,
): value is LoopRunResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LoopRunResult>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.runId !== "string" ||
    candidate.project !== expectedProject ||
    typeof candidate.status !== "string" ||
    !(LOOP_RUN_STATUSES as readonly string[]).includes(candidate.status) ||
    typeof candidate.startedAt !== "string" ||
    (candidate.completedAt !== null && typeof candidate.completedAt !== "string")
  ) {
    return false;
  }
  return isTerminalLoopRunResult(candidate as LoopRunResult);
}

/**
 * Finds one exact persisted run without applying the bounded recent-history
 * report window. The journal is scanned once in fixed-size chunks and only a
 * single matching entry is retained in memory. Duplicate run ids fail closed.
 */
export function lookupRunHistoryEntry(
  projectName: string,
  runId: string,
): LoopRunHistoryLookupResult {
  let filePath: string;
  try {
    filePath = resolveRunHistoryFilePath(projectName);
  } catch (error) {
    if (error instanceof InvalidRunHistoryProjectIdentityError) {
      return Object.freeze({
        found: false,
        code: "invalid_project_identity" as const,
        corruptedLines: 0,
      });
    }
    throw error;
  }

  if (!existsSync(filePath)) {
    return Object.freeze({
      found: false,
      code: "not_found" as const,
      corruptedLines: 0,
    });
  }

  let fd: number;
  try {
    fd = openSync(filePath, "r");
  } catch {
    return Object.freeze({
      found: false,
      code: "read_failed" as const,
      corruptedLines: 0,
    });
  }

  let corruptedLines = 0;
  let matched: LoopRunResult | null = null;
  let duplicate = false;
  let leftover = "";
  const decoder = new StringDecoder("utf8");

  function processLine(rawLine: string): void {
    const line = rawLine.trim();
    if (line.length === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      corruptedLines += 1;
      return;
    }
    if (!isKnownRunHistoryEntry(parsed, projectName)) {
      corruptedLines += 1;
      return;
    }
    if (parsed.runId !== runId) return;
    if (matched !== null) {
      duplicate = true;
      return;
    }
    matched = parsed;
  }

  try {
    const buffer = Buffer.alloc(RUN_HISTORY_LOOKUP_CHUNK_BYTES);
    let bytesRead: number;
    while (
      (bytesRead = readSync(
        fd,
        buffer,
        0,
        RUN_HISTORY_LOOKUP_CHUNK_BYTES,
        null,
      )) > 0
    ) {
      leftover += decoder.write(buffer.subarray(0, bytesRead));
      const lines = leftover.split("\n");
      leftover = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    }
    leftover += decoder.end();
    if (leftover.length > 0) processLine(leftover);
  } catch {
    return Object.freeze({
      found: false,
      code: "read_failed" as const,
      corruptedLines,
    });
  } finally {
    closeSync(fd);
  }

  if (duplicate) {
    return Object.freeze({
      found: false,
      code: "duplicate_run_id" as const,
      corruptedLines,
    });
  }
  if (matched === null) {
    return Object.freeze({
      found: false,
      code: "not_found" as const,
      corruptedLines,
    });
  }
  return Object.freeze({
    found: true,
    entry: matched,
    corruptedLines,
  });
}
