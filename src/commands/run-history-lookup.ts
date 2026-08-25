import type { LoopApplicationAssembly } from "../composition/index.js";
import type { LoopRunResult } from "../loop/types.js";
import { terminal } from "../ui/terminal.js";

export type RunHistoryLookupReport =
  | Readonly<{
      schemaVersion: 1;
      project: string;
      runId: string;
      found: true;
      entry: LoopRunResult;
      corruptedLines: number;
    }>
  | Readonly<{
      schemaVersion: 1;
      project: string;
      runId: string;
      found: false;
      code:
        | "not_found"
        | "duplicate_run_id"
        | "invalid_project_identity"
        | "read_failed";
      corruptedLines: number;
    }>;

export function generateRunHistoryLookupReport(
  application: Pick<LoopApplicationAssembly, "lookupRunHistoryEntry">,
  projectName: string,
  runId: string,
): RunHistoryLookupReport {
  const lookup = application.lookupRunHistoryEntry(projectName, runId);
  return lookup.found
    ? Object.freeze({
        schemaVersion: 1 as const,
        project: projectName,
        runId,
        found: true as const,
        entry: lookup.entry,
        corruptedLines: lookup.corruptedLines,
      })
    : Object.freeze({
        schemaVersion: 1 as const,
        project: projectName,
        runId,
        found: false as const,
        code: lookup.code,
        corruptedLines: lookup.corruptedLines,
      });
}

export function printRunHistoryLookup(
  application: Pick<LoopApplicationAssembly, "lookupRunHistoryEntry">,
  projectName: string,
  runId: string,
  json: boolean,
): number {
  const report = generateRunHistoryLookupReport(application, projectName, runId);
  if (json) {
    console.log(JSON.stringify(report));
    return report.found ? 0 : 1;
  }

  terminal.header(`Run history • ${projectName} • ${runId}`);
  if (report.corruptedLines > 0) {
    terminal.warning(
      `${report.corruptedLines} corrupted entr${report.corruptedLines === 1 ? "y" : "ies"} skipped.`,
    );
  }
  if (!report.found) {
    terminal.warning(`Run lookup failed: ${report.code}`);
    return 1;
  }

  terminal.info(
    `${report.entry.completedAt ?? report.entry.startedAt} — ${report.entry.mode} — ${report.entry.status} — run ${report.entry.runId}`,
  );
  return 0;
}
