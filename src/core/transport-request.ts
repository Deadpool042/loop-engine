import type {
  AuthorizationConfigurationResult,
} from "../authorization/types.js";
import {
  createTransportRequestError,
  createTransportRequestFromAuthorization,
  createTransportRequestResult,
  OpenClawTransportRequestFixture,
  summarizeTransportRequest,
  validateTransportRequest,
  type TransportRequest,
  type TransportRequestCreationOptions,
  type TransportRequestResult,
} from "../transport-request/index.js";

export function createDeclarativeTransportRequest(
  configurationResult: AuthorizationConfigurationResult,
  options?: TransportRequestCreationOptions,
): TransportRequest {
  return createTransportRequestFromAuthorization(configurationResult, options);
}

export function validateDeclarativeTransportRequest(
  request: TransportRequest,
): TransportRequestResult {
  return validateTransportRequest(request);
}

export function createOpenClawTransportRequestFixture(): TransportRequest {
  return OpenClawTransportRequestFixture;
}

export function createDeclarativeTransportRequestResult(
  request: TransportRequest,
): TransportRequestResult {
  return createTransportRequestResult(
    request,
    "not_dispatchable",
    createTransportRequestError(
      "transport_request_not_dispatchable",
      "TransportRequest is declarative and not dispatchable.",
    ),
    summarizeTransportRequest(request),
  );
}
