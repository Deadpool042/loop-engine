import type { AnthropicEffort, LoopApplicationAssembly, LoopApplicationProject } from "../composition/index.js";
import { terminal } from "../ui/terminal.js";
type Input = Readonly<{ model?: string; effort?: AnthropicEffort; timeoutMs: number }>;
export async function printGateReassessment(application: LoopApplicationAssembly, project: LoopApplicationProject, input: Input): Promise<void> {
  const report = await application.generateGateReassessmentReport(project, input);
  terminal.header(`Gate reassessment • ${report.project.name}`);
  if (report.result.status !== "completed") { terminal.warning(report.result.reason); return; }
  terminal.success(report.assessment?.status === "review_recommended" ? "Revue manuelle recommandée." : "Aucun signal nouveau.");
  terminal.info(`${report.result.model} · effort ${report.result.effort ?? "—"} · ${report.result.durationMs} ms`);
  if (report.result.usage) terminal.info(`Usage: ${report.result.usage.inputTokens} entrée / ${report.result.usage.outputTokens} sortie`);
  if ("actualCalculatedCostUsd" in report.result) terminal.info(`Coût réel calculé : $${report.result.actualCalculatedCostUsd?.toFixed(4)}`);
  if (report.assessment) terminal.info(report.assessment.reason);
}
export async function printGateReassessmentJson(application: LoopApplicationAssembly, project: LoopApplicationProject, input: Input): Promise<void> { console.log(JSON.stringify(await application.generateGateReassessmentReport(project, input))); }
export function printGateReassessmentEstimateJson(application: LoopApplicationAssembly, project: LoopApplicationProject): void { console.log(JSON.stringify(application.generateGateReassessmentEstimateReport(project))); }
