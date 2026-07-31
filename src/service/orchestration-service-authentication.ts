import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  OrchestrationServiceTransport,
  OrchestrationServiceTransportRequest,
  OrchestrationServiceTransportResponse,
} from "./orchestration-service-transport.js";

export const ORCHESTRATION_SERVICE_AUTH_HEADERS = Object.freeze({
  keyId: "x-loop-key-id",
  timestamp: "x-loop-timestamp",
  nonce: "x-loop-nonce",
  signature: "x-loop-signature",
});

export type OrchestrationServiceHmacKeyResolver = Readonly<{
  resolve(keyId: string): Promise<string | null>;
}>;

export type OrchestrationServiceReplayStore = Readonly<{
  consume(
    keyId: string,
    nonce: string,
    expiresAtEpochSeconds: number,
  ): Promise<boolean>;
}>;

export type OrchestrationServiceAuthenticationOptions = Readonly<{
  keyResolver: OrchestrationServiceHmacKeyResolver;
  replayStore: OrchestrationServiceReplayStore;
  nowEpochSeconds(): number;
  maxClockSkewSeconds?: number;
  nonceTtlSeconds?: number;
}>;

export type OrchestrationServiceSignatureInput = Readonly<{
  keyId: string;
  secret: string;
  timestamp: number;
  nonce: string;
  method: "GET" | "POST";
  path: string;
  body: unknown;
}>;

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
});

function response(
  status: number,
  error: string,
): OrchestrationServiceTransportResponse {
  return Object.freeze({
    status,
    headers: JSON_HEADERS,
    body: Object.freeze({ error }),
  });
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`);
  return `{${entries.join(",")}}`;
}

function signingPayload(input: Omit<OrchestrationServiceSignatureInput, "secret">): string {
  return [
    input.keyId,
    String(input.timestamp),
    input.nonce,
    input.method,
    input.path,
    canonicalize(input.body),
  ].join("\n");
}

export function signOrchestrationServiceRequest(
  input: OrchestrationServiceSignatureInput,
): string {
  return createHmac("sha256", input.secret)
    .update(signingPayload(input))
    .digest("hex");
}

function isValidToken(value: string | undefined, maxLength: number): value is string {
  return value !== undefined && value.length > 0 && value.length <= maxLength && value.trim() === value;
}

function equalSignature(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/u.test(actual)) return false;
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isPublicProbe(request: OrchestrationServiceTransportRequest): boolean {
  return request.method === "GET" && (request.path === "/healthz" || request.path === "/readyz");
}

export function createAuthenticatedOrchestrationServiceTransport(
  inner: OrchestrationServiceTransport,
  options: OrchestrationServiceAuthenticationOptions,
): OrchestrationServiceTransport {
  const maxClockSkewSeconds = options.maxClockSkewSeconds ?? 300;
  const nonceTtlSeconds = options.nonceTtlSeconds ?? 600;
  if (!Number.isSafeInteger(maxClockSkewSeconds) || maxClockSkewSeconds < 0) {
    throw new Error("Authentication clock skew must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(nonceTtlSeconds) || nonceTtlSeconds <= 0) {
    throw new Error("Authentication nonce TTL must be a positive safe integer.");
  }

  return Object.freeze({
    async handle(
      request: OrchestrationServiceTransportRequest,
    ): Promise<OrchestrationServiceTransportResponse> {
      if (isPublicProbe(request)) return inner.handle(request);

      const headers = request.headers ?? Object.freeze({});
      const keyId = headers[ORCHESTRATION_SERVICE_AUTH_HEADERS.keyId];
      const timestampText = headers[ORCHESTRATION_SERVICE_AUTH_HEADERS.timestamp];
      const nonce = headers[ORCHESTRATION_SERVICE_AUTH_HEADERS.nonce];
      const signature = headers[ORCHESTRATION_SERVICE_AUTH_HEADERS.signature];
      if (
        !isValidToken(keyId, 128) ||
        !isValidToken(timestampText, 20) ||
        !isValidToken(nonce, 256) ||
        !isValidToken(signature, 64)
      ) {
        return response(401, "authentication_required");
      }

      const timestamp = Number(timestampText);
      const now = options.nowEpochSeconds();
      if (
        !Number.isSafeInteger(timestamp) ||
        !Number.isSafeInteger(now) ||
        Math.abs(now - timestamp) > maxClockSkewSeconds
      ) {
        return response(401, "authentication_expired");
      }

      const secret = await options.keyResolver.resolve(keyId);
      if (secret === null || secret.length === 0) {
        return response(401, "authentication_failed");
      }
      const expected = signOrchestrationServiceRequest({
        keyId,
        secret,
        timestamp,
        nonce,
        method: request.method,
        path: request.path,
        body: request.body,
      });
      if (!equalSignature(signature, expected)) {
        return response(401, "authentication_failed");
      }

      const consumed = await options.replayStore.consume(
        keyId,
        nonce,
        timestamp + nonceTtlSeconds,
      );
      if (!consumed) return response(409, "replay_rejected");
      return inner.handle(request);
    },
  });
}
