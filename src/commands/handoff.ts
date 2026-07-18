import type { ProjectConfig } from "../core/config.js";
import { buildProjectSnapshot } from "../intelligence/project-snapshot.js";
import { terminal } from "../ui/terminal.js";

export function printProjectHandoff(project: ProjectConfig): void {
  const snapshot = buildProjectSnapshot(project);
  const selectedCandidate = snapshot.roadmap.selectedCandidate;

  terminal.header(`Handoff • ${snapshot.project.name}`);

  terminal.section("Project");
  terminal.info(`Path: ${snapshot.project.path}`);
  terminal.info(`Type: ${snapshot.project.type}`);
  terminal.info(`Branch: ${snapshot.git.branch}`);
  terminal.info(`Git clean: ${snapshot.git.clean ? "yes" : "no"}`);
  terminal.info(`Health: ${snapshot.health}`);

  terminal.section("Roadmap");
  terminal.info(`Active: ${snapshot.roadmap.summary.active}`);
  terminal.info(`Done: ${snapshot.roadmap.summary.done}`);
  terminal.info(`Selectable: ${snapshot.roadmap.summary.selectable}`);

  if (selectedCandidate) {
    terminal.section("Selected candidate");
    terminal.info(`Kind: ${selectedCandidate.kind}`);
    terminal.info(`Status: ${selectedCandidate.status}`);
    terminal.info(`Priority: ${selectedCandidate.priority}`);
    terminal.info(`Reason: ${selectedCandidate.reason}`);
    terminal.info(`${selectedCandidate.path}:${selectedCandidate.line}`);
    terminal.info(selectedCandidate.text);
  } else {
    terminal.warning("No selected roadmap candidate.");
  }

  terminal.section("Validation");
  if (snapshot.validation.commands.length === 0) {
    terminal.warning("No validation command configured.");
  } else {
    for (const command of snapshot.validation.commands) {
      terminal.success(command);
    }
  }

  terminal.section("Instructions");
  terminal.info(
    "Use this handoff as context for a human-supervised assistant session.",
  );
  terminal.info(
    "Do not start implementation without explicit human confirmation.",
  );
}

export function printProjectHandoffJson(project: ProjectConfig): void {
  const snapshot = buildProjectSnapshot(project);

  console.log(
    JSON.stringify({
      schemaVersion: 1,
      project: snapshot.project,
      git: snapshot.git,
      roadmap: {
        available: snapshot.roadmap.available,
        paths: snapshot.roadmap.paths,
        selectedCandidate: snapshot.roadmap.selectedCandidate,
        summary: snapshot.roadmap.summary,
        stats: snapshot.roadmap.stats,
      },
      validation: snapshot.validation,
      health: snapshot.health,
      instructions: [
        "Use this handoff as context for a human-supervised assistant session.",
        "Do not start implementation without explicit human confirmation.",
      ],
    }),
  );
}
