import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

export function printRoadmapOverview(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  const report = application.generateRoadmapOverviewReport(project);

  terminal.header(`Roadmap overview • ${report.project.name}`);
  terminal.info(`Planning: ${report.planning.mode ?? "non déclaré"}`);
  terminal.info(
    `Lots: ${report.roadmap.stats.todo} à faire, ${report.roadmap.stats.inProgress} en cours, ${report.roadmap.stats.done} terminés.`,
  );
  terminal.info(
    `Candidats exposés: ${report.roadmap.candidates.items.length}/${report.roadmap.candidates.total}.`,
  );
  terminal.info(
    `Phase-gates exposés: ${report.roadmap.phaseGates.items.length}/${report.roadmap.phaseGates.total}.`,
  );
}

export function printRoadmapOverviewJson(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  console.log(JSON.stringify(application.generateRoadmapOverviewReport(project)));
}
