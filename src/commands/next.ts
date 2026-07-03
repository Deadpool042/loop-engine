import { type ProjectConfig } from "../core/config.js";
import { buildProjectSnapshot } from "../intelligence/project-snapshot.js";
import { selectRoadmapCandidate } from "../intelligence/roadmap.js";
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

    terminal.section("Roadmap candidates");

    const safeCount = snapshot.roadmap.candidates.filter(
      (candidate) => candidate.kind === "safe",
    ).length;
    const warningCount = snapshot.roadmap.candidates.filter(
      (candidate) => candidate.kind === "warning",
    ).length;
    const blockedCount = snapshot.roadmap.candidates.filter(
      (candidate) => candidate.kind === "blocked",
    ).length;

    terminal.success(`safe: ${safeCount}`);
    terminal.warning(`warning: ${warningCount}`);

    if (blockedCount > 0) {
      terminal.error(`blocked: ${blockedCount}`);
    } else {
      terminal.success("blocked: 0");
    }

    terminal.section("Selected roadmap candidate");

    const selectedCandidate = selectRoadmapCandidate(snapshot.roadmap.candidates);

    if (selectedCandidate) {
      if (selectedCandidate.kind === "safe") {
        terminal.success("Safe candidate selected");
      } else if (selectedCandidate.kind === "warning") {
        terminal.warning("Sensitive candidate selected");
      } else {
        terminal.error("Only blocked candidates detected");
      }

      terminal.info(`Kind: ${selectedCandidate.kind}`);
      terminal.info(`Reason: ${selectedCandidate.reason}`);
      terminal.info(`${selectedCandidate.path}:${selectedCandidate.line}`);
      terminal.info(selectedCandidate.text);
    } else {
      terminal.warning("No roadmap candidate detected.");
    }

    terminal.section("Next action");
    if (selectedCandidate?.kind === "blocked") {
      terminal.warning("Do not start this candidate directly.");
      terminal.info("Open the roadmap and choose a smaller safe prerequisite.");
    } else if (selectedCandidate?.kind === "warning") {
      terminal.warning("Review this candidate carefully before starting.");
      terminal.info("Prefer a smaller safe prerequisite if possible.");
    } else {
      terminal.info("Open the roadmap and select the next safe micro-lot.");
    }
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


export function printNextProjectActionJson(project: ProjectConfig): void {
  const snapshot = buildProjectSnapshot(project);
  const selectedCandidate = selectRoadmapCandidate(snapshot.roadmap.candidates);

  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        project: snapshot.project,
        git: snapshot.git,
        roadmap: {
          ...snapshot.roadmap,
          selectedCandidate,
        },
        validation: snapshot.validation,
        health: snapshot.health,
      },
      null,
      2,
    ),
  );
}
