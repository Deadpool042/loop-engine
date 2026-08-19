import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

function reasonLabel(
  reason: ReturnType<
    LoopApplicationAssembly["generateRoadmapProposalContextReport"]
  >["objective"]["reason"],
): string | null {
  switch (reason) {
    case "planning_mode_maintenance":
      return "Contexte indisponible : projet en maintenance.";
    case "planning_mode_deferred":
      return "Contexte indisponible : travail différé.";
    case "planning_mode_external":
      return "Contexte indisponible : planification externe.";
    case "planning_mode_not_roadmap":
      return "Contexte indisponible : mode roadmap non déclaré.";
    case "objective_source_not_configured":
      return "Contexte indisponible : aucune source d’objectif canonique configurée.";
    case "objective_source_outside_project_root":
      return "Contexte indisponible : source d’objectif hors du root du projet.";
    case "objective_source_missing":
      return "Contexte indisponible : source d’objectif absente.";
    case "objective_source_not_file":
      return "Contexte indisponible : la source d’objectif doit être un fichier.";
    case "objective_source_unreadable":
      return "Contexte indisponible : source d’objectif illisible.";
    case "objective_source_too_large":
      return "Contexte indisponible : source d’objectif trop volumineuse.";
    case undefined:
      return null;
  }
}

export function printRoadmapProposalContext(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  const report = application.generateRoadmapProposalContextReport(project);

  terminal.header(`Roadmap proposal context • ${report.project.name}`);
  terminal.info(`Planning: ${report.planning.mode ?? "non déclaré"}`);
  terminal.info(`Objectif: ${report.objective.source ?? "non configurée"}`);

  if (report.context === null) {
    const reason = reasonLabel(report.objective.reason);
    if (reason) terminal.warning(reason);
    return;
  }

  terminal.success("Contexte déterministe disponible.");
  terminal.info(
    `Roadmap: ${report.roadmap.stats.todo} à faire, ${report.roadmap.stats.done} terminée(s), ${report.roadmap.summary.selectable} sélectionnable(s).`,
  );
  terminal.info(
    `Candidats exposés: ${report.roadmap.candidates.items.length}/${report.roadmap.candidates.total}.`,
  );
  terminal.info(
    `Phase-gates exposés: ${report.roadmap.phaseGates.items.length}/${report.roadmap.phaseGates.total}.`,
  );
}

export function printRoadmapProposalContextJson(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  console.log(
    JSON.stringify(application.generateRoadmapProposalContextReport(project)),
  );
}
