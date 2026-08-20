import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

const PROFILE_LABELS: Record<string, string> = {
  economy: "Économique",
  balanced: "Équilibré",
  deep: "Approfondi",
};

export function printRoadmapProposalEstimate(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  const report = application.generateRoadmapProposalEstimateReport(project);
  terminal.header(`Roadmap proposal estimate • ${report.project.name}`);
  if (report.estimate.status === "unavailable") {
    terminal.warning(`Estimation indisponible : ${report.estimate.reason}`);
    return;
  }
  const { estimate } = report;
  terminal.info(
    `Profil recommandé : ${PROFILE_LABELS[estimate.profile] ?? estimate.profile}`,
  );
  terminal.info(
    `Modèle : ${estimate.model}${estimate.effort ? ` (effort ${estimate.effort})` : ""}`,
  );
  terminal.info(`Contexte estimé : ~${estimate.estimatedInputTokens} tokens`);
  terminal.info(`Sortie estimée : ~${estimate.estimatedOutputTokens} tokens`);
  if ("estimatedCostUsd" in estimate) {
    terminal.info(`Coût estimé : ~$${estimate.estimatedCostUsd.toFixed(4)}`);
  }
  terminal.info(`Raison : ${estimate.reason}`);
}

export function printRoadmapProposalEstimateJson(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
): void {
  console.log(
    JSON.stringify(application.generateRoadmapProposalEstimateReport(project)),
  );
}
