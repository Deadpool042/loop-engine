import type { LoopApplicationAssembly, LoopApplicationProject } from "../composition/index.js";
import { terminal } from "../ui/terminal.js";

export async function printRoadmapProposal(application:LoopApplicationAssembly,project:LoopApplicationProject,input:Readonly<{model:string;timeoutMs:number}>):Promise<void>{
 const report=await application.generateRoadmapProposalReport(project,input);
 terminal.header(`Roadmap proposal • ${report.project.name}`);
 if(report.result.status==="unavailable"){terminal.warning(`Proposition indisponible : ${report.result.reason}`);return;}
 if(report.result.status==="failed"){terminal.error(`Proposition indisponible : ${report.result.reason}`);return;}
 terminal.success(report.proposal?.status==="no_proposal"?"Aucun nouveau lot proposé.":"Proposition disponible.");
 terminal.info(`Provider: ${report.result.provider} • ${report.result.model} • ${report.result.durationMs} ms`);
 if(report.assessment){terminal.section("Assessment");for(const gap of report.assessment.observedGaps)terminal.info(`Écart observé : ${gap}`);for(const assumption of report.assessment.assumptions)terminal.info(`Hypothèse : ${assumption}`);}
 if(report.proposal?.status==="no_proposal")terminal.info(report.proposal.reason);
 if(report.proposal?.status==="proposed"){terminal.info(report.proposal.summary);for(const lot of report.proposal.lots)terminal.info(`${lot.title} — ${lot.objective}`);}
}
export async function printRoadmapProposalJson(application:LoopApplicationAssembly,project:LoopApplicationProject,input:Readonly<{model:string;timeoutMs:number}>):Promise<void>{console.log(JSON.stringify(await application.generateRoadmapProposalReport(project,input)));}
