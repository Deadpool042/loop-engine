import type { AuthorizationEvaluation, AuthorizationReason } from "./types.js";

/** Structural validation only; no Runtime, Provider, or Transport is invoked. */
export function validateAuthorizationEvaluation(
  evaluation: AuthorizationEvaluation,
): AuthorizationReason | null {
  if (
    evaluation.mapping === undefined ||
    evaluation.mappingResult.mappingId === null
  ) {
    return "mapping_mismatch";
  }
  if (
    evaluation.intent === undefined ||
    evaluation.intentResult.intentId === null
  ) {
    return "intent_mismatch";
  }
  if (evaluation.mapping.id !== evaluation.mappingResult.mappingId) {
    return "mapping_mismatch";
  }
  if (evaluation.intent.id !== evaluation.intentResult.intentId) {
    return "intent_mismatch";
  }
  return null;
}
