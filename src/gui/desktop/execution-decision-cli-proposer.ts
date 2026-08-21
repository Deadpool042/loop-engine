import { ExecutionDecisionProviderFailure } from "../../governance/execution-decision-provider.js";
import type { ExecutionDecisionCurrent, ExecutionDecisionProviderProposal } from "../../governance/execution-decision-service.js";
import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";
import type { ProviderKeychainReader } from "../keychain-reader.js";
import { ExecutionDecisionPreparationPassthroughFailure } from "../../governance/execution-decision-errors.js";

export const DESKTOP_EXECUTION_DECISION_TIMEOUT_MS = 60_000;
export class ExecutionDecisionCliBoundaryFailure extends ExecutionDecisionPreparationPassthroughFailure { constructor(readonly code: "repository_unavailable" | "cli_spawn_failed" | "cli_timeout" | "cli_response_invalid") { super(); this.message = code; this.name = "ExecutionDecisionCliBoundaryFailure"; } }
type Parsed = Readonly<{ status: "completed"; proposal: ExecutionDecisionProviderProposal }> | Readonly<{ status: "stale" }> | Readonly<{ status: "failed"; failure: ConstructorParameters<typeof ExecutionDecisionProviderFailure>[0] }>;
function boundary(code: ExecutionDecisionCliBoundaryFailure["code"]): never { throw new ExecutionDecisionCliBoundaryFailure(code); }
function only(value: Record<string, unknown>, keys: readonly string[]): boolean { return Object.keys(value).every((key) => keys.includes(key)); }
function parse(value: unknown, expectedProject: string): Parsed | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>; if (root.schemaVersion !== 1 || root.project !== expectedProject || typeof root.result !== "object" || root.result === null || Array.isArray(root.result)) return null;
  const result = root.result as Record<string, unknown>;
  if (result.status === "stale" && result.code === "decision_draft_stale" && only(result, ["status", "code"]) && only(root, ["schemaVersion", "project", "result"])) return { status: "stale" };
  if (result.status === "completed" && result.provider === "anthropic_api" && result.model === "claude-sonnet-5" && result.effort === "low" && typeof result.durationMs === "number" && Number.isInteger(result.durationMs) && result.durationMs >= 0 && only(result, ["status", "provider", "model", "effort", "durationMs", "usage", "actualCalculatedCostUsd", "pricingEffectiveDate"]) && typeof root.proposal === "object" && root.proposal !== null && !Array.isArray(root.proposal) && only(root.proposal as Record<string, unknown>, ["objective", "deliverables", "outOfScope", "allowedPaths", "forbiddenContentTerms"]) && only(root, ["schemaVersion", "project", "result", "proposal"])) return { status: "completed", proposal: root.proposal as ExecutionDecisionProviderProposal };
  if (result.status === "failed" && typeof result.code === "string" && only(result, ["status", "code", "model", "durationMs", "httpStatus", "providerErrorType"]) && only(root, ["schemaVersion", "project", "result"])) return { status: "failed", failure: { status: "failed", provider: "anthropic_api", model: typeof result.model === "string" ? result.model : null, code: result.code as ConstructorParameters<typeof ExecutionDecisionProviderFailure>[0]["code"], message: "CLI provider failed.", durationMs: typeof result.durationMs === "number" ? result.durationMs : 0, truncated: false, ...(typeof result.httpStatus === "number" ? { httpStatus: result.httpStatus } : {}), ...(typeof result.providerErrorType === "string" ? { providerErrorType: result.providerErrorType } : {}) } };
  return null;
}
export function createCliExecutionDecisionProposer(options: Readonly<{ cliInvoker: CliInvoker; resolveRepositoryPath: () => string | null; keychainReader: ProviderKeychainReader }>): (current: ExecutionDecisionCurrent) => Promise<ExecutionDecisionProviderProposal> {
  return async (current) => {
    const repositoryPath = options.resolveRepositoryPath(); if (repositoryPath === null) boundary("repository_unavailable");
    const credential = await options.keychainReader.read(); if (!credential.ok) throw new Error("keychain_unavailable");
    let invocation: CliInvocationResult;
    try { invocation = await options.cliInvoker.invoke("execution-decision", ["propose", current.project, "--candidate", current.candidateId, "--source-document", current.sourceDocument, "--git-head", current.gitHead, "--provider", "anthropic_api", "--provider-model", "claude-sonnet-5", "--provider-effort", "low", "--provider-timeout-ms", String(DESKTOP_EXECUTION_DECISION_TIMEOUT_MS)], repositoryPath, { ANTHROPIC_API_KEY: credential.apiKey }); } catch { boundary("cli_spawn_failed"); }
    if (!invocation.ok) boundary(invocation.kind === "timeout" ? "cli_timeout" : "cli_spawn_failed");
    const parsed = parse(invocation.json, current.project); if (parsed === null) boundary("cli_response_invalid");
    if (parsed.status === "stale") throw new Error("decision_draft_stale");
    if (parsed.status === "failed") throw new ExecutionDecisionProviderFailure(parsed.failure);
    return parsed.proposal;
  };
}
