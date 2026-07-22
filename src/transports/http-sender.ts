import type { LoopRuntimeEscalationProjectionSender } from "../core/loop-runtime-escalation-delivery.js";

export type LoopRuntimeEscalationHttpSenderOptions = Readonly<{
  url: string;
  allowedUrls: readonly string[];
  method: "POST";
  headers?: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxPayloadBytes: number;
  fetchImpl?: typeof fetch;
}>;

type HttpSenderErrorKind =
  | "HTTP sender configuration rejected"
  | "HTTP sender payload rejected"
  | "HTTP sender timed out"
  | "HTTP sender request failed"
  | "HTTP sender response rejected";

function createHttpSenderError(
  kind: HttpSenderErrorKind,
  cause?: unknown,
): Error {
  return cause === undefined ? new Error(kind) : new Error(kind, { cause });
}

function isSafePositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function parseAbsoluteHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeAllowedUrls(allowedUrls: readonly string[]): readonly string[] {
  const normalized: string[] = [];
  for (const allowedUrl of allowedUrls) {
    const parsed = parseAbsoluteHttpUrl(allowedUrl);
    if (parsed === null) {
      throw createHttpSenderError("HTTP sender configuration rejected");
    }
    normalized.push(parsed.href);
  }
  return normalized;
}

function validateConfiguration(
  options: LoopRuntimeEscalationHttpSenderOptions,
): { requestUrl: URL } {
  if (!isSafePositiveInteger(options.timeoutMs) || !isSafePositiveInteger(options.maxPayloadBytes)) {
    throw createHttpSenderError("HTTP sender configuration rejected");
  }

  const requestUrl = parseAbsoluteHttpUrl(options.url);
  if (requestUrl === null) {
    throw createHttpSenderError("HTTP sender configuration rejected");
  }

  const allowedUrlSet = new Set(normalizeAllowedUrls(options.allowedUrls));
  if (!allowedUrlSet.has(requestUrl.href)) {
    throw createHttpSenderError("HTTP sender configuration rejected");
  }

  return { requestUrl };
}

function payloadSizeInBytes(payload: string): number {
  return new TextEncoder().encode(payload).byteLength;
}

function validatePayload(
  payload: string,
  maxPayloadBytes: number,
): void {
  if (payloadSizeInBytes(payload) > maxPayloadBytes) {
    throw createHttpSenderError("HTTP sender payload rejected");
  }
}

export function createLoopRuntimeEscalationHttpSender(
  options: LoopRuntimeEscalationHttpSenderOptions,
): LoopRuntimeEscalationProjectionSender {
  const { requestUrl } = validateConfiguration(options);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return Object.freeze({
    async send(payload: string): Promise<void> {
      validatePayload(payload, options.maxPayloadBytes);

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, options.timeoutMs);

      try {
        const response = await (async () => {
          try {
            const requestInit: RequestInit = {
              method: options.method,
              body: payload,
              redirect: "error",
              signal: controller.signal,
              ...(options.headers === undefined
                ? {}
                : { headers: options.headers }),
            };
            return await fetchImpl(requestUrl.href, {
              ...requestInit,
            });
          } catch (error) {
            if (timedOut) {
              throw createHttpSenderError("HTTP sender timed out", error);
            }
            throw createHttpSenderError("HTTP sender request failed", error);
          }
        })();

        if (!response.ok) {
          throw createHttpSenderError("HTTP sender response rejected");
        }
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
