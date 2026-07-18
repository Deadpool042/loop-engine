import {
  createTransportRequestError,
  createTransportRequestResult,
  OpenClawTransportRequestFixture,
  summarizeTransportRequest,
  validateTransportRequest,
  type TransportRequest,
  type TransportRequestResult,
} from "../transport-request/index.js";

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
