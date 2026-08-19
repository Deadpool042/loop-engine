import assert from "node:assert/strict";
import test from "node:test";
import { generateRoadmapProposalFromContext } from "../../src/intelligence/roadmap-proposal.js";
import type { TextOnlyProvider } from "../../src/text-only-provider/index.js";

const context = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1 as const, project: { name: "loop-engine", nameTruncated: false, type: "node-cli", typeTruncated: false },
  planning: { mode: "roadmap" }, objective: { source: "docs/objective.md", available: true, eligibleForRoadmapProposal: true, content: "Goal." },
  context: "available" as const,
  roadmap: { configuredPaths: ["roadmap.md"], configuredPathsTotal: 1, configuredPathsTruncated: false, stats: { todo: 0, done: 1 }, summary: { selectable: 0 }, selectedCandidate: null, candidates: { items: [], total: 1, truncated: false }, phaseGates: { items: [], total: 0, truncated: false } },
  projectState: { git: { branch: "main", branchTruncated: false, clean: true, requiresGit: true }, validation: { commands: [], commandsTotal: 0, commandsTruncated: false, configured: true }, health: [] },
  ...overrides,
});
function fake(output:string,calls:{value:number}):TextOnlyProvider{return {async invoke(){calls.value+=1;return {status:"completed",provider:"anthropic_api",model:"claude-sonnet-5",output,durationMs:2,truncated:false};}};}
const noProposal=JSON.stringify({schemaVersion:1,project:{name:"loop-engine"},assessment:{observedGaps:[],assumptions:[]},proposal:{status:"no_proposal",reason:"No observable gap."}});
test("returns a valid no_proposal after exactly one provider call",async()=>{const calls={value:0};const result=await generateRoadmapProposalFromContext(context() as never,{provider:fake(noProposal,calls),providerAvailable:true,model:"claude-sonnet-5",timeoutMs:1000});assert.equal(calls.value,1);assert.equal(result.result.status,"completed");assert.equal(result.proposal?.status,"no_proposal");});
test("accepts a bounded proposed result",async()=>{const calls={value:0};const output=JSON.stringify({schemaVersion:1,project:{name:"loop-engine"},assessment:{observedGaps:["Gap"],assumptions:["Assumption"]},proposal:{status:"proposed",summary:"Summary",lots:[{title:"Lot",objective:"Objective",benefit:"Benefit",cost:"low",risk:"low",dependencies:[]}]}});const result=await generateRoadmapProposalFromContext(context() as never,{provider:fake(output,calls),providerAvailable:true,model:"claude-sonnet-5",timeoutMs:1000});assert.equal(result.proposal?.status,"proposed");assert.equal(calls.value,1);});
test("refuses unavailable, truncated and missing-credential contexts before provider",async()=>{const calls={value:0};for(const [value,available] of [[context({context:null,objective:{available:false,eligibleForRoadmapProposal:false,reason:"planning_mode_maintenance"}}),true],[context({project:{name:"loop-engine",nameTruncated:true}}),true],[context(),false]] as const){const result=await generateRoadmapProposalFromContext(value as never,{provider:fake(noProposal,calls),providerAvailable:available,model:"claude-sonnet-5",timeoutMs:1000});assert.equal(result.result.status,"unavailable");}assert.equal(calls.value,0);});
test("rejects invalid schema and excessive lots without repair",async()=>{const calls={value:0};const invalid=JSON.stringify({schemaVersion:1,project:{name:"loop-engine"},assessment:{observedGaps:[],assumptions:[]},proposal:{status:"proposed",summary:"x",lots:Array.from({length:4},()=>({title:"a",objective:"a",benefit:"a",cost:"low",risk:"low",dependencies:[]}))}});const result=await generateRoadmapProposalFromContext(context() as never,{provider:fake(invalid,calls),providerAvailable:true,model:"claude-sonnet-5",timeoutMs:1000});assert.equal(result.result.status,"failed");assert.equal(calls.value,1);});
