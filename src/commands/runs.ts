import type { LoopApplicationAssembly } from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

export type PrintRunHistoryOptions = Readonly<{
  json?: boolean;
  limit?: number;
  models?: boolean;
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
  if (options.models) {
    const report = application.generateRunModelEfficiencyReport(projectName, {
      ...(options.limit === undefined ? {} : { limit: options.limit }),
    });

    if (options.json) {
      console.log(JSON.stringify(report));
      return;
    }

    terminal.header(`Model efficiency • ${report.project}`);
    terminal.info(
      `Window: ${report.historyEntries} history entries, ${report.executionRuns} execution runs, ${report.observedRuns} model-attributed runs`,
    );
    if (report.unattributedExecutionRuns > 0) {
      terminal.warning(
        `${report.unattributedExecutionRuns} execution run(s) lack model evidence and were not attributed.`,
      );
    }
    if (report.corruptedLines > 0) {
      terminal.warning(
        `${report.corruptedLines} corrupted run history entr${report.corruptedLines === 1 ? "y" : "ies"} skipped.`,
      );
    }
    terminal.info(
      "Tokens/cost/quota: unavailable — no reliable provider usage or quota source is recorded.",
    );

    if (report.models.length === 0) {
      terminal.info("No provider-backed execution with model evidence in this window.");
      return;
    }

    terminal.section("Terminal model outcomes");
    for (const model of report.models) {
      const categories =
        model.taskCategories.length === 0
          ? "unknown"
          : model.taskCategories
              .map((entry) => `${entry.category}:${entry.count}`)
              .join(",");
      terminal.info(
        `${model.provider}/${model.runtime} • ${model.model} — runs=${model.terminalRuns}, completed=${model.outcomes.completed}, failed=${model.outcomes.failed}, validation=${model.validation.passedRuns}/${model.validation.observedRuns}, repairs=${model.validation.totalRepairAttempts}, durationMs=${model.duration.totalMs}, categories=${categories}, modifiedFiles=${model.files.modifiedTotal}, outOfScope=${model.files.outOfScopeTotal}/${model.files.outOfScopeObservedRuns}`,
      );
    }

    if (report.providerAttempts.length > 0) {
      terminal.section("Provider attempts");
      for (const model of report.providerAttempts) {
        terminal.info(
          `${model.provider}/${model.runtime} • ${model.model} — attempts=${model.attempts}, completed=${model.completed}, failed=${model.failed}, recoverableFailures=${model.recoverableFailures}`,
        );
      }
    }
    return;
  }

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
