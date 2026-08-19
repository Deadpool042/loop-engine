import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

function modeLabel(
  mode: ReturnType<
    LoopApplicationAssembly["generateProjectObjectiveReport"]
  >["planning"]["mode"],
): string {
  return mode ?? "non déclaré";
}

function reasonLabel(
  reason: ReturnType<
    LoopApplicationAssembly["generateProjectObjectiveReport"]
  >["objective"]["reason"],
): string | null {
  switch (reason) {
    case "planning_mode_maintenance":
      return "Proposition de roadmap indisponible : projet en maintenance.";
    case "planning_mode_deferred":
      return "Proposition de roadmap indisponible : travail différé.";
    case "planning_mode_external":
      return "Proposition de roadmap indisponible : planification externe.";
    case "planning_mode_not_roadmap":
      return "Proposition de roadmap indisponible : mode roadmap non déclaré.";
    case "objective_source_not_configured":
      return "Aucune source d’objectif canonique configurée.";
    case "objective_source_outside_project_root":
      return "La source d’objectif est hors du root du projet.";
    case "objective_source_missing":
      return "La source d’objectif configurée est absente.";
    case "objective_source_not_file":
      return "La source d’objectif doit désigner un fichier.";
    case "objective_source_unreadable":
      return "La source d’objectif ne peut pas être lue.";
    case "objective_source_too_large":
      return "La source d’objectif dépasse la taille autorisée.";
    case undefined:
      return null;
  }
}

export function printProjectObjective(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  const report = application.generateProjectObjectiveReport(project);
  const { objective } = report;

  terminal.header(`Roadmap objective • ${report.project.name}`);
  terminal.info(`Planning: ${modeLabel(report.planning.mode)}`);
  terminal.info(`Source: ${objective.source ?? "non configurée"}`);
  terminal.info(
    `Éligible à une proposition de roadmap: ${objective.eligibleForRoadmapProposal ? "oui" : "non"}`,
  );

  const reason = reasonLabel(objective.reason);
  if (reason) terminal.warning(reason);

  if (objective.content !== undefined) {
    terminal.section("Objectif canonique");
    console.log(objective.content);
  }
}

export function printProjectObjectiveJson(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  console.log(
    JSON.stringify(application.generateProjectObjectiveReport(project)),
  );
}
