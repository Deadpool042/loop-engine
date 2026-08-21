import { ExecutionDecisionProviderFailure } from "../../governance/execution-decision-provider.js";
import { createProductionExecutionDecisionService } from "../../governance/execution-decision-production.js";
import type { ProviderKeychainReader } from "../keychain-reader.js";
import type { DesktopExecutionDecisionResult } from "./execution-decision-contract.js";
import { createCliExecutionDecisionProposer } from "./execution-decision-cli-proposer.js";
import type { CliInvoker } from "../cli-invoker.js";

const messages: Readonly<Record<string, string>> = {
  decision_draft_invalid: "Le brouillon de décision est invalide.", decision_draft_missing: "Ce brouillon n’est plus disponible.",
  decision_draft_stale: "Le contexte a changé. Préparez une nouvelle décision.", decision_draft_write_failed: "L’écriture de la décision a échoué.",
  decision_draft_post_write_invalid: "La décision écrite n’a pas pu être validée.", decision_draft_recovery_failed: "La récupération de sécurité a échoué.",
  provider_authentication_failed: "Authentification Anthropic refusée.", provider_permission_denied: "La clé Anthropic n’a pas accès à cette ressource.", provider_rate_limited: "Limite Anthropic atteinte.", provider_timeout: "Anthropic n’a pas répondu dans le délai prévu.", provider_request_failed: "La requête envoyée à Anthropic a été refusée.", provider_billing_failed: "La facturation Anthropic ne permet pas cette requête.", provider_not_found: "La ressource Anthropic demandée est introuvable.", provider_request_too_large: "La requête envoyée à Anthropic est trop volumineuse.", provider_response_invalid: "La réponse Anthropic est invalide.", provider_refused: "Anthropic a refusé cette demande.", provider_output_truncated: "La réponse Anthropic a été tronquée.", provider_server_error: "Le service Anthropic est temporairement indisponible.", provider_unavailable: "Le service Anthropic est temporairement indisponible.",
};
const failed = (code: string, message?: string, provider?: Extract<DesktopExecutionDecisionResult, { ok: false }> ["provider"]): DesktopExecutionDecisionResult => ({ ok: false, code, message: message ?? messages[code] ?? "La préparation de la décision est indisponible.", ...(provider === undefined ? {} : { provider }) });

export function createDesktopExecutionDecisionController(options: Readonly<{ keychainReader: ProviderKeychainReader; cliInvoker: CliInvoker; resolveRepositoryPath: () => string | null }>) {
  const service = createProductionExecutionDecisionService(createCliExecutionDecisionProposer(options));
  return Object.freeze({
    async prepare(projectName: unknown): Promise<DesktopExecutionDecisionResult> {
      try { const result = await service.prepare(projectName); if (!result.ok) return failed(result.code); return result; }
      catch (error) { if (error instanceof ExecutionDecisionProviderFailure) { const failure = error.failure; return failed(failure.code, undefined, { ...(failure.model === null ? {} : { model: failure.model }), durationMs: failure.durationMs, ...(failure.httpStatus === undefined ? {} : { httpStatus: failure.httpStatus }), failureCode: failure.code }); } return failed(error instanceof Error && error.message === "keychain_unavailable" ? "keychain_unavailable" : error instanceof Error && error.message === "decision_draft_stale" ? "decision_draft_stale" : "provider_unavailable", error instanceof Error && error.message === "keychain_unavailable" ? "Identifiant Anthropic indisponible dans le trousseau macOS." : undefined); }
    },
    async approve(draftId: unknown): Promise<DesktopExecutionDecisionResult> {
      try { const result = await service.approve(draftId); return result.ok ? { ok: true } : failed(result.code); }
      catch { return failed("decision_draft_recovery_failed"); }
    },
  });
}
