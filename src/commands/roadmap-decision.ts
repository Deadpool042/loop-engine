import type {
  AnthropicEffort,
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

type RoadmapDecisionInput = Readonly<{
  requestProposal?: Readonly<{
    model?: string;
    effort?: AnthropicEffort;
    timeoutMs: number;
  }>;
}>;

export async function printRoadmapDecision(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
  input: RoadmapDecisionInput,
): Promise<void> {
  const report = await application.generateRoadmapDecisionReport(
    project,
    input,
  );
  terminal.header(`Roadmap decision • ${report.project.name}`);

  switch (report.decision) {
    case "existing_candidate":
      terminal.success("Candidat existant admissible.");
      if (report.candidate) terminal.info(report.candidate.text);
      return;
    case "proposal":
      terminal.success("Proposition disponible.");
      if (report.proposal?.status === "proposed") {
        terminal.info(report.proposal.summary);
        for (const lot of report.proposal.lots)
          terminal.info(`${lot.title} — ${lot.objective}`);
      }
      return;
    case "no_proposal":
      terminal.info(`Aucun nouveau lot proposé : ${report.reason}`);
      return;
    case "unavailable":
      terminal.warning(`Décision indisponible : ${report.reason}`);
      return;
  }
}

export async function printRoadmapDecisionJson(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
  input: RoadmapDecisionInput,
): Promise<void> {
  console.log(
    JSON.stringify(
      await application.generateRoadmapDecisionReport(project, input),
    ),
  );
}
