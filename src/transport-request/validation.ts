import {
  createTransportRequestError,
  createTransportRequestResult,
} from "./errors.js";
import { summarizeTransportRequest } from "./support.js";
import type {
  TransportRequest,
  TransportRequestErrorCode,
  TransportRequestResult,
} from "./types.js";

function result(
  request: TransportRequest,
  code: TransportRequestErrorCode,
  message: string,
  status: TransportRequestResult["status"] = "invalid",
): TransportRequestResult {
  return createTransportRequestResult(
    request,
    status,
    createTransportRequestError(code, message),
    summarizeTransportRequest(request),
  );
}

/** Validates only declarative references; it never resolves or calls adapters. */
export function validateTransportRequest(
  request: TransportRequest,
): TransportRequestResult {
  if (!request.authorization.configurationId) {
    return result(
      request,
      "transport_request_authorization_missing",
      "TransportRequest has no authorization configuration reference.",
    );
  }
  if (!request.providerId || !request.provider) {
    return result(
      request,
      "transport_request_provider_missing",
      "TransportRequest has no provider reference.",
    );
  }
  if (!request.mapping.mappingId) {
    return result(
      request,
      "transport_request_mapping_missing",
      "TransportRequest has no executable mapping reference.",
    );
  }
  if (!request.runtime.runtimeId) {
    return result(
      request,
      "transport_request_runtime_missing",
      "TransportRequest has no runtime reference.",
    );
  }
  if (!request.transport.transportId) {
    return result(
      request,
      "transport_request_transport_missing",
      "TransportRequest has no transport reference.",
    );
  }
  if (request.capabilities.length === 0) {
    return result(
      request,
      "transport_request_capability_missing",
      "TransportRequest has no capability reference.",
    );
  }
  if (!request.policy.policyId) {
    return result(
      request,
      "transport_request_policy_missing",
      "TransportRequest has no policy reference.",
    );
  }
  if (!request.authorization.authorized) {
    return result(
      request,
      "transport_request_not_authorized",
      "TransportRequest authorization reference is not authorized.",
      "inactive",
    );
  }
  if (!request.active || !request.dispatchable) {
    return result(
      request,
      "transport_request_not_dispatchable",
      "TransportRequest is declarative and not dispatchable.",
      "not_dispatchable",
    );
  }
  return result(
    request,
    "transport_request_not_executable",
    "TransportRequest is declarative and not executable.",
    "not_executable",
  );
}
