import type { LoopApplicationAssembly } from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

export type PrintRunHistoryOptions = Readonly<{
  json?: boolean;
  limit?: number;
}>;

/**
 * Read-only, bounded view of a project's Run History journal. This command
 * never writes: writing happens exclusively as a side effect of `run`
 * (see `src/commands/run.ts`).
 */
export function printRunHistory(
  application: LoopApplicationAssembly,
  projectName: string,
  options: PrintRunHistoryOptions = {},
): void {
  const report = application.generateRunHistoryReport(projectName, {
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  });

  if (options.json) {
    console.log(JSON.stringify(report));
    return;
  }

  terminal.header(`Run history • ${report.project}`);
  terminal.info(`Limit: ${report.limit}`);
  if (report.corruptedLines > 0) {
    terminal.warning(
      `${report.corruptedLines} corrupted entr${report.corruptedLines === 1 ? "y" : "ies"} skipped.`,
    );
  }

  if (report.entries.length === 0) {
    terminal.info("No recorded run.");
    return;
  }

  terminal.section("Runs (most recent first)");
  for (const entry of report.entries) {
    terminal.info(
      `${entry.completedAt ?? entry.startedAt} — ${entry.mode} — ${entry.status} — run ${entry.runId}`,
    );
  }
}
