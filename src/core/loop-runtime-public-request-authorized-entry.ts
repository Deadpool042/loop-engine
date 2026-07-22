import type { LoopRuntimePublicRequest } from "./loop-runtime-public-request.js";
import {
  decodeLoopRuntimePublicRequest,
  type LoopRuntimePublicRequestDecodeFailureReason,
} from "./loop-runtime-public-request-decoder.js";
import type {
  LoopRuntimeAuthenticatedPrincipal,
  LoopRuntimePublicRequestAuthorizer,
} from "./loop-runtime-public-request-authorization.js";
import { authorizeLoopRuntimePublicRequest } from "./loop-runtime-public-request-authorization-facade.js";

export type LoopRuntimePublicRequestAuthorizedEntryInput = Readonly<{
  principal: LoopRuntimeAuthenticatedPrincipal;
  payload: unknown;
  authorizer: LoopRuntimePublicRequestAuthorizer;
}>;

export type LoopRuntimePublicRequestAuthorizedEntryResult =
  | Readonly<{
      authorized: true;
      request: LoopRuntimePublicRequest;
    }>
  | Readonly<{
      authorized: false;
      stage: "decoding";
      reason: LoopRuntimePublicRequestDecodeFailureReason;
    }>
  | Readonly<{
      authorized: false;
      stage: "authorization";
      reason: "not_authorized";
    }>;

function failDecoding(
  reason: LoopRuntimePublicRequestDecodeFailureReason,
): LoopRuntimePublicRequestAuthorizedEntryResult {
  return Object.freeze({
    authorized: false as const,
    stage: "decoding" as const,
    reason,
  });
}

function failAuthorization(): LoopRuntimePublicRequestAuthorizedEntryResult {
  return Object.freeze({
    authorized: false as const,
    stage: "authorization" as const,
    reason: "not_authorized" as const,
  });
}

export async function decodeAndAuthorizeLoopRuntimePublicRequest(
  input: LoopRuntimePublicRequestAuthorizedEntryInput,
): Promise<LoopRuntimePublicRequestAuthorizedEntryResult> {
  const decodeResult = decodeLoopRuntimePublicRequest(input.payload);

  if (!decodeResult.parsed) {
    return failDecoding(decodeResult.reason);
  }

  const authorization = await authorizeLoopRuntimePublicRequest(
    input.principal,
    decodeResult.request,
    input.authorizer,
  );

  if (!authorization.authorized) {
    return failAuthorization();
  }

  return Object.freeze({
    authorized: true as const,
    request: decodeResult.request,
  });
}
