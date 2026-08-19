import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

function modeLabel(mode: ReturnType<
  LoopApplicationAssembly["generateRoadmapPlanningStatusReport"]
>["planning"]["mode"]): string {
  return mode ?? "non déclaré";
}

function recommendationLabel(
  recommendation: ReturnType<
    LoopApplicationAssembly["generateRoadmapPlanningStatusReport"]
  >["planning"]["recommendation"],
): string {
  switch (recommendation) {
    case "roadmap_configured":
      return "roadmap configurée";
    case "connect_discovered_roadmap":
      return "raccorder la roadmap existante";
    case "no_roadmap_present":
      return "aucune roadmap présente — aucune action proposée";
    case "maintenance_no_work":
      return "aucune action proposée";
    case "deferred_no_work":
      return "aucune action proposée";
    case "external_planning_source":
      return "consulter la source de pilotage externe";
    case "no_admissible_candidate":
      return "aucun candidat admissible";
  }
}

export function printRoadmapStatus(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  const report = application.generateRoadmapPlanningStatusReport(project);
  const { planning } = report;

  terminal.header(`Roadmap status • ${report.project.name}`);
  terminal.info(`Planning: ${modeLabel(planning.mode)}`);
  terminal.info(
    `Roadmap configurée: ${planning.roadmapConfigured ? "oui" : "non"}`,
  );

  if (planning.configuredPaths.length > 0) {
    terminal.section("Roadmaps configurées");
    for (const path of planning.configuredPaths) terminal.success(path);
  }

  if (planning.discoveredPaths.length > 0) {
    terminal.section("Roadmaps détectées");
    for (const path of planning.discoveredPaths) terminal.success(path);
  }

  if (planning.mode === "maintenance") {
    terminal.section("État");
    terminal.info("Travail planifié volontairement absent.");
  } else if (planning.mode === "deferred") {
    terminal.section("État");
    terminal.info("Travail planifié différé.");
  } else if (planning.mode === "external") {
    terminal.section("État");
    terminal.info("Planification gérée hors de Loop Engine.");
  }

  terminal.section("Recommandation");
  terminal.info(recommendationLabel(planning.recommendation));
}

export function printRoadmapStatusJson(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  console.log(
    JSON.stringify(application.generateRoadmapPlanningStatusReport(project)),
  );
}
