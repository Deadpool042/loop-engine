import type { LoopApplicationAssembly } from "../composition/index.js";
import type { ExecutionDecisionProposeInput } from "../composition/execution-decision-proposal.js";
export async function printExecutionDecisionProposalJson(application: LoopApplicationAssembly, input: ExecutionDecisionProposeInput): Promise<void> { console.log(JSON.stringify(await application.runExecutionDecisionProposal(input))); }
