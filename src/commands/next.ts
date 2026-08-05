import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

export function printNextProjectAction(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  const { generateProjectReport } = application;
  const snapshot = generateProjectReport(project);

  terminal.header(`Next • ${snapshot.project.name}`);

  terminal.section("Roadmap summary");
  terminal.info(`Active: ${snapshot.roadmap.summary.active}`);
  terminal.info(`Done: ${snapshot.roadmap.summary.done}`);
  terminal.info(`Selectable: ${snapshot.roadmap.summary.selectable}`);

  if (snapshot.roadmap.summary.hasBlocked) {
    terminal.warning("Blocked candidate present.");
  } else {
    terminal.success("No blocked candidate.");
  }

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

    const safeCount = snapshot.roadmap.stats.safe;
    const warningCount = snapshot.roadmap.stats.warning;
    const blockedCount = snapshot.roadmap.stats.blocked;

    terminal.success(`safe: ${safeCount}`);
    terminal.warning(`warning: ${warningCount}`);

    if (blockedCount > 0) {
      terminal.error(`blocked: ${blockedCount}`);
    } else {
      terminal.success("blocked: 0");
    }

    terminal.section("Selected roadmap candidate");

    const selectedCandidate = snapshot.roadmap.selectedCandidate;
    const hasSelectableCandidate = snapshot.roadmap.summary.selectable > 0;

    if (selectedCandidate) {
      if (selectedCandidate.kind === "safe") {
        terminal.success("Safe candidate selected");
      } else if (selectedCandidate.kind === "warning") {
        terminal.warning("Sensitive candidate selected");
      } else {
        terminal.error("Only blocked candidates detected");
      }

      terminal.info(`Kind: ${selectedCandidate.kind}`);
      terminal.info(`Status: ${selectedCandidate.status}`);
      terminal.info(`Priority: ${selectedCandidate.priority}`);
      terminal.info(`Reason: ${selectedCandidate.reason}`);
      terminal.info(`${selectedCandidate.path}:${selectedCandidate.line}`);
      terminal.info(selectedCandidate.text);

      terminal.section("Decision hint");
      if (selectedCandidate.kind === "blocked") {
        terminal.error("Do not start this candidate directly.");
        terminal.info("Choose a smaller prerequisite first.");
      } else if (selectedCandidate.kind === "warning") {
        terminal.warning("Frame this candidate before implementation.");
        terminal.info("Prefer a short Cowork lot before Code.");
      } else {
        terminal.success(
          "Candidate looks compatible with a small reversible lot.",
        );
      }
    } else if (hasSelectableCandidate) {
      terminal.warning("No roadmap candidate could be selected.");
    } else {
      terminal.success("No selectable roadmap candidate remains.");
    }

    terminal.section("Next action");
    if (selectedCandidate?.kind === "blocked") {
      terminal.warning("Do not start this candidate directly.");
      terminal.info("Open the roadmap and choose a smaller safe prerequisite.");
    } else if (selectedCandidate?.kind === "warning") {
      terminal.warning("Review this candidate carefully before starting.");
      terminal.info("Prefer a smaller safe prerequisite if possible.");
    } else if (!selectedCandidate && !hasSelectableCandidate) {
      terminal.success("Roadmap has no remaining actionable candidate.");
      terminal.info(
        "Record a new explicit roadmap item only after its prerequisite or decision gate is satisfied.",
      );
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

export function printNextProjectActionJson(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  console.log(
    JSON.stringify(application.generateNextProjectActionReport(project)),
  );
}
