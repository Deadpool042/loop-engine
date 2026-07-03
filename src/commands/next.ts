import { type ProjectConfig } from "../core/config.js";
import { buildProjectSnapshot } from "../intelligence/project-snapshot.js";
import { terminal } from "../ui/terminal.js";

export function printNextProjectAction(project: ProjectConfig): void {
  const snapshot = buildProjectSnapshot(project);

  terminal.header(`Next • ${snapshot.project.name}`);

  terminal.section("Project");
  terminal.info(`Type: ${snapshot.project.type}`);
  terminal.info(`Path: ${snapshot.project.path}`);

  terminal.section("Git");
  if (!snapshot.git.requiresGit) {
    terminal.warning("Git repository not required.");
  } else {
    terminal.info(`Branch: ${snapshot.git.branch}`);

    if (snapshot.git.clean) {
      terminal.success("Working tree clean.");
    } else {
      terminal.warning("Working tree dirty.");
    }

    if (snapshot.git.lastCommit) {
      terminal.info(
        `Last commit: ${snapshot.git.lastCommit.hash.slice(0, 8)} ${snapshot.git.lastCommit.message}`,
      );
    }
  }

  terminal.section("Roadmap");
  if (!snapshot.roadmap.available) {
    terminal.warning("No roadmap configured.");
    terminal.info("Next action: configure a roadmap path in projects.yaml.");
  } else {
    for (const roadmapPath of snapshot.roadmap.paths) {
      terminal.success(roadmapPath);
    }

    terminal.section("Roadmap candidate");

    const firstCandidate = snapshot.roadmap.candidates[0];

    if (firstCandidate) {
      if (firstCandidate.kind === "safe") {
        terminal.success("Safe candidate detected");
      } else if (firstCandidate.kind === "warning") {
        terminal.warning("Sensitive candidate detected");
      } else {
        terminal.error("Blocked candidate detected");
      }

      terminal.info(`${firstCandidate.path}:${firstCandidate.line}`);
      terminal.info(firstCandidate.text);
    } else {
      terminal.warning("No roadmap candidate detected.");
    }

    terminal.section("Next action");
    terminal.info("Open the roadmap and select the next safe micro-lot.");
  }

  terminal.section("Validation");
  if (!snapshot.validation.configured) {
    terminal.warning("No validation command configured.");
  } else {
    for (const command of snapshot.validation.commands) {
      terminal.success(command);
    }
  }

  terminal.section("Recommended workflow");
  terminal.info("1. Run project context.");
  terminal.info("2. Read the roadmap and required docs.");
  terminal.info("3. Work on one small reversible lot.");
  terminal.info("4. Run validation.");
  terminal.info("5. Run review before commit.");
}
