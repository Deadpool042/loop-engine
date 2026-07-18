import {
  generateWorkspaceReports,
  generateWorkspaceSummaryReport,
  type Config,
} from "../core/index.js";
import { terminal } from "../ui/terminal.js";

export function printWorkspaceSummary(config: Config): void {
  terminal.header("Summary");

  for (const snapshot of generateWorkspaceReports(config)) {
    const git = snapshot.git.requiresGit
      ? snapshot.git.clean
        ? "clean"
        : "dirty"
      : "no git";

    const docs =
      snapshot.docs.missing.length === 0
        ? "docs OK"
        : `${snapshot.docs.missing.length} doc(s) missing`;

    const statusIcon =
      snapshot.health === "good"
        ? "✓"
        : snapshot.health === "warning"
          ? "⚠"
          : "✖";

    const roadmapIndicator = snapshot.roadmap.summary.hasBlocked ? "🔴" : "🟢";

    const roadmapState =
      `${roadmapIndicator} roadmap A:${snapshot.roadmap.summary.active}` +
      ` D:${snapshot.roadmap.summary.done}`;

    console.log(
      `${statusIcon} ${snapshot.project.name.padEnd(12)} ${git.padEnd(8)} ${docs.padEnd(18)} validations ${snapshot.validation.commands.length} ${roadmapState}`,
    );
  }
}

export function printWorkspaceSummaryJson(config: Config): void {
  console.log(JSON.stringify(generateWorkspaceSummaryReport(config)));
}
