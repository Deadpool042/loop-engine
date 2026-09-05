import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

export function printRoadmapCandidateDetail(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
  candidateKey: string,
): void {
  const report = application.generateRoadmapCandidateDetailReport(
    project,
    candidateKey,
  );

  terminal.header(`Roadmap detail • ${report.project.name}`);
  if (report.status !== "ok") {
    terminal.info(`${report.status}: ${report.reason}`);
    return;
  }

  terminal.info(report.detail.title);
  terminal.info(`Source: ${report.detail.path}`);
  for (const section of report.detail.sections) {
    terminal.section(section.title);
    terminal.info(section.content || "—");
  }
}

export function printRoadmapCandidateDetailJson(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
  candidateKey: string,
): void {
  console.log(
    JSON.stringify(
      application.generateRoadmapCandidateDetailReport(project, candidateKey),
    ),
  );
}
