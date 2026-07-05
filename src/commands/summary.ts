import { type Config } from "../core/config.js";
import { buildProjectSnapshot } from "../intelligence/project-snapshot.js";
import { terminal } from "../ui/terminal.js";

export function printWorkspaceSummary(config: Config): void {
  terminal.header("Summary");

  for (const project of config.projects) {
    const snapshot = buildProjectSnapshot(project);

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

    const roadmapIndicator =
      snapshot.roadmap.summary.hasBlocked ? "🔴" : "🟢";

    const roadmapState =
      `${roadmapIndicator} roadmap A:${snapshot.roadmap.summary.active}` +
      ` D:${snapshot.roadmap.summary.done}`;

    console.log(
      `${statusIcon} ${snapshot.project.name.padEnd(12)} ${git.padEnd(8)} ${docs.padEnd(18)} validations ${snapshot.validation.commands.length} ${roadmapState}`,
    );
  }
}

export function printWorkspaceSummaryJson(config: Config): void {
  const projects = config.projects.map((project) => {
    const snapshot = buildProjectSnapshot(project);

    return {
      ...snapshot,
      roadmap: {
        available: snapshot.roadmap.available,
        paths: snapshot.roadmap.paths,
        selectedCandidate: snapshot.roadmap.selectedCandidate,
        stats: snapshot.roadmap.stats,
      },
    };
  });

  console.log(JSON.stringify({ schemaVersion: 1, projects }));
}
