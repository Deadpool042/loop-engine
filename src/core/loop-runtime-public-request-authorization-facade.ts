import type { LoopRuntimePublicRequest } from "./loop-runtime-public-request.js";
import {
  createLoopRuntimePublicRequestAuthorizationRequest,
  type LoopRuntimeAuthenticatedPrincipal,
  type LoopRuntimePublicRequestAuthorizationDecision,
  type LoopRuntimePublicRequestAuthorizer,
} from "./loop-runtime-public-request-authorization.js";
import { evaluateLoopRuntimePublicRequestAuthorization } from "./loop-runtime-public-request-authorization-evaluation.js";

const NOT_AUTHORIZED_DECISION: LoopRuntimePublicRequestAuthorizationDecision =
  Object.freeze({
    authorized: false,
    reason: "not_authorized",
  });

export async function authorizeLoopRuntimePublicRequest(
  principal: LoopRuntimeAuthenticatedPrincipal,
  request: LoopRuntimePublicRequest,
  authorizer: LoopRuntimePublicRequestAuthorizer,
): Promise<LoopRuntimePublicRequestAuthorizationDecision> {
  try {
    const creation = createLoopRuntimePublicRequestAuthorizationRequest(
      principal,
      request,
    );

    if (!creation.created) {
      return NOT_AUTHORIZED_DECISION;
    }

    return evaluateLoopRuntimePublicRequestAuthorization(
      creation.authorizationRequest,
      authorizer,
    );
  } catch {
    return NOT_AUTHORIZED_DECISION;
  }
}
