import type {
  AnthropicEffort,
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

type RoadmapProposeInput = Readonly<{
  model?: string;
  effort?: AnthropicEffort;
  timeoutMs: number;
}>;

export async function printRoadmapProposal(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
  input: RoadmapProposeInput,
): Promise<void> {
  const report = await application.generateRoadmapProposalReport(
    project,
    input,
  );
  terminal.header(`Roadmap proposal • ${report.project.name}`);
  if (report.result.status === "unavailable") {
    terminal.warning(`Proposition indisponible : ${report.result.reason}`);
    return;
  }
  if (report.result.status === "failed") {
    terminal.error(`Proposition indisponible : ${report.result.reason}`);
    return;
  }
  terminal.success(
    report.proposal?.status === "no_proposal"
      ? "Aucun nouveau lot proposé."
      : "Proposition disponible.",
  );
  const profile = "profile" in report ? ` • profil ${report.profile}` : "";
  terminal.info(
    `Provider: ${report.result.provider} • ${report.result.model}${report.result.effort ? ` (effort ${report.result.effort})` : ""}${profile} • ${report.result.durationMs} ms`,
  );
  if (report.result.usage)
    terminal.info(
      `Usage: ${report.result.usage.inputTokens} tokens entrée, ${report.result.usage.outputTokens} tokens sortie`,
    );
  const actualCalculatedCostUsd = (
    report.result as { actualCalculatedCostUsd?: number }
  ).actualCalculatedCostUsd;
  if (actualCalculatedCostUsd !== undefined)
    terminal.info(`Coût réel calculé : $${actualCalculatedCostUsd.toFixed(4)}`);
  if (report.assessment) {
    terminal.section("Assessment");
    for (const gap of report.assessment.observedGaps)
      terminal.info(`Écart observé : ${gap}`);
    for (const assumption of report.assessment.assumptions)
      terminal.info(`Hypothèse : ${assumption}`);
  }
  if (report.proposal?.status === "no_proposal")
    terminal.info(report.proposal.reason);
  if (report.proposal?.status === "proposed") {
    terminal.info(report.proposal.summary);
    for (const lot of report.proposal.lots)
      terminal.info(`${lot.title} — ${lot.objective}`);
  }
}
export async function printRoadmapProposalJson(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
  input: RoadmapProposeInput,
): Promise<void> {
  console.log(
    JSON.stringify(
      await application.generateRoadmapProposalReport(project, input),
    ),
  );
}
