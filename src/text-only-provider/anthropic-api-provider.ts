import {
  ANTHROPIC_EFFORT_VALUES,
  MAX_TEXT_ONLY_CONTEXT_BYTES,
  MAX_TEXT_ONLY_MODEL_CHARACTERS,
  MAX_TEXT_ONLY_OUTPUT_BYTES,
  MAX_TEXT_ONLY_OUTPUT_TOKENS,
  MAX_TEXT_ONLY_SYSTEM_PROMPT_BYTES,
  MAX_TEXT_ONLY_TIMEOUT_MS,
  MIN_TEXT_ONLY_TIMEOUT_MS,
  type TextOnlyProvider,
  type TextOnlyProviderFailure,
  type TextOnlyProviderFailureCode,
  type TextOnlyProviderInput,
  type TextOnlyProviderResult,
  type TextOnlyProviderUsage,
} from "./types.js";
import { calculateCostUsd, resolveAnthropicPricing } from "./pricing.js";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/**
 * Bounded, deterministic retry policy for clearly transient Anthropic
 * Messages API errors only (HTTP 429 and the retryable 5xx statuses already
 * classified as `provider_server_error` by `httpFailureCode`). Never
 * retried: authentication, billing, permission, not-found, request-too-large
 * and other validation-shaped 4xx errors, refusals, truncation, invalid
 * responses, and local timeouts/transport failures. This is intentionally a
 * single small local primitive, not a generic retry framework.
 */
const ANTHROPIC_MAX_ATTEMPTS = 3;
const ANTHROPIC_RETRY_BASE_DELAY_MS = 250;
const ANTHROPIC_RETRY_MAX_DELAY_MS = 2_000;
const ANTHROPIC_RETRY_AFTER_MAX_MS = 30_000;
const ANTHROPIC_RETRYABLE_HTTP_STATUSES: ReadonlySet<number> = new Set([
  429, 500, 502, 503, 504, 529,
]);
export type AnthropicSleep = (delayMs: number) => Promise<void>;
function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
function parseRetryAfterMs(headerValue: string | null): number | null {
  if (headerValue === null) return null;
  const seconds = Number(headerValue);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}
/** Bounded backoff: honors a present, well-formed `Retry-After` (capped), otherwise deterministic exponential backoff (capped). */
function anthropicRetryDelayMs(
  attempt: number,
  retryAfterHeader: string | null,
): number {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  if (retryAfterMs !== null)
    return Math.min(retryAfterMs, ANTHROPIC_RETRY_AFTER_MAX_MS);
  const exponential = ANTHROPIC_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  return Math.min(exponential, ANTHROPIC_RETRY_MAX_DELAY_MS);
}
export type TextOnlyHttpRequest = Readonly<{
  url: string;
  method: "POST";
  headers: Readonly<Record<string, string>>;
  body: string;
  signal: AbortSignal;
}>;
export type TextOnlyHttpTransport = (
  request: TextOnlyHttpRequest,
) => Promise<Response>;
export type AnthropicApiProviderOptions = Readonly<{
  environment?: Readonly<Record<string, string | undefined>>;
  transport?: TextOnlyHttpTransport;
  maxOutputTokens?: number;
  now?: () => number;
  /** Injectable delay primitive for deterministic retry-backoff tests; defaults to a real `setTimeout`-based sleep. */
  sleep?: AnthropicSleep;
}>;
type AnthropicMessageResponse = Readonly<{
  content?: unknown;
  model?: unknown;
  usage?: Readonly<{
    input_tokens?: unknown;
    output_tokens?: unknown;
    cache_creation_input_tokens?: unknown;
    cache_read_input_tokens?: unknown;
  }>;
  stop_reason?: unknown;
}>;
type AnthropicErrorEnvelope = Readonly<{
  type?: unknown;
  error?: Readonly<{ type?: unknown; message?: unknown }>;
  request_id?: unknown;
}>;
function defaultTransport(request: TextOnlyHttpRequest): Promise<Response> {
  return fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
  });
}
function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
function validString(value: string, max: number): boolean {
  return value.trim().length > 0 && byteLength(value) <= max;
}
function validModel(value: string): boolean {
  return (
    value.trim().length > 0 && value.length <= MAX_TEXT_ONLY_MODEL_CHARACTERS
  );
}
function validTimeout(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_TEXT_ONLY_TIMEOUT_MS &&
    value <= MAX_TEXT_ONLY_TIMEOUT_MS
  );
}
function validOutputTokenLimit(value: number): boolean {
  return (
    Number.isInteger(value) && value > 0 && value <= MAX_TEXT_ONLY_OUTPUT_TOKENS
  );
}
function validEffort(value: TextOnlyProviderInput["effort"]): boolean {
  return (
    value === undefined ||
    (ANTHROPIC_EFFORT_VALUES as readonly string[]).includes(value)
  );
}
function validOutputSchema(
  value: TextOnlyProviderInput["outputSchema"],
): boolean {
  return (
    value === undefined ||
    (typeof value === "object" &&
      value !== null &&
      typeof value.schema === "object" &&
      value.schema !== null)
  );
}
function sanitizeAnthropicSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAnthropicSchemaValue);
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "maxLength" || key === "maxItems") continue;
    result[key] = sanitizeAnthropicSchemaValue(item);
  }
  return result;
}
/**
 * Pure transform from a business JSON Schema to what is actually transmitted
 * to the Anthropic Messages API as `output_config.format.schema` (strips
 * keywords Structured Outputs does not support, e.g. maxLength/maxItems).
 * Exported so the pre-call token estimate can size the real transmitted
 * schema instead of duplicating this sanitization logic.
 */
export function toAnthropicOutputSchema(
  schema: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return sanitizeAnthropicSchemaValue(schema) as Readonly<
    Record<string, unknown>
  >;
}
export function hasAnthropicApiCredential(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return Boolean(environment.ANTHROPIC_API_KEY?.trim());
}
function failure(
  model: string | null,
  code: TextOnlyProviderFailureCode,
  message: string,
  durationMs: number,
  truncated = false,
  diagnostics: Readonly<{
    httpStatus?: number;
    providerErrorType?: string;
    requestId?: string;
    diagnosticMessage?: string;
  }> = {},
  attempts?: number,
): TextOnlyProviderFailure {
  return Object.freeze({
    status: "failed",
    provider: "anthropic_api",
    model,
    code,
    message,
    durationMs,
    truncated,
    ...diagnostics,
    ...(attempts === undefined ? {} : { attempts }),
  });
}
function boundedString(value: unknown, max = 512): string | undefined {
  return typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= max
    ? value
    : undefined;
}
function parseAnthropicError(body: string): Readonly<{
  providerErrorType?: string;
  requestId?: string;
  diagnosticMessage?: string;
}> {
  try {
    const parsed = JSON.parse(body) as AnthropicErrorEnvelope;
    if (parsed.type !== "error") return {};
    return Object.freeze({
      ...(boundedString(parsed.error?.type, 96) === undefined
        ? {}
        : { providerErrorType: boundedString(parsed.error?.type, 96)! }),
      ...(boundedString(parsed.request_id, 256) === undefined
        ? {}
        : { requestId: boundedString(parsed.request_id, 256)! }),
      ...(boundedString(parsed.error?.message) === undefined
        ? {}
        : { diagnosticMessage: boundedString(parsed.error?.message)! }),
    });
  } catch {
    return {};
  }
}
/**
 * Local cost estimate strictly from `pricing.ts`, never a fabricated
 * estimate: `null` when the model is not in the pricing table for the given
 * date, or when cache tokens are present (the pricing table has no cache
 * read/write rates yet, so mixing them into the input/output rate would be
 * a fabricated number rather than a known one).
 */
function costUsdForUsage(
  model: string,
  usage: TextOnlyProviderUsage,
  atIsoDate: string,
): number | null {
  if (
    usage.cacheCreationInputTokens !== undefined ||
    usage.cacheReadInputTokens !== undefined
  )
    return null;
  const pricing = resolveAnthropicPricing(model, atIsoDate);
  return pricing === null
    ? null
    : calculateCostUsd(usage.inputTokens, usage.outputTokens, pricing);
}
function httpFailureCode(status: number): TextOnlyProviderFailureCode {
  if (status === 400) return "provider_request_failed";
  if (status === 401) return "provider_authentication_failed";
  if (status === 402) return "provider_billing_failed";
  if (status === 403) return "provider_permission_denied";
  if (status === 404) return "provider_not_found";
  if (status === 413) return "provider_request_too_large";
  if (status === 429) return "provider_rate_limited";
  if ([500, 502, 503, 504, 529].includes(status))
    return "provider_server_error";
  return "provider_request_failed";
}
async function readBoundedResponseBody(
  response: Response,
): Promise<{ body: string; exceeded: boolean }> {
  if (response.body === null) return { body: "", exceeded: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      totalBytes += next.value.byteLength;
      if (totalBytes > MAX_TEXT_ONLY_OUTPUT_BYTES) {
        await reader.cancel();
        return { body: "", exceeded: true };
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder().decode(bytes), exceeded: false };
}
function parseUsage(value: unknown): TextOnlyProviderUsage | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const usage = value as NonNullable<AnthropicMessageResponse["usage"]>;
  if (
    !Number.isInteger(usage.input_tokens) ||
    !Number.isInteger(usage.output_tokens)
  )
    return undefined;
  return Object.freeze({
    inputTokens: usage.input_tokens as number,
    outputTokens: usage.output_tokens as number,
    ...(Number.isInteger(usage.cache_creation_input_tokens)
      ? {
          cacheCreationInputTokens: usage.cache_creation_input_tokens as number,
        }
      : {}),
    ...(Number.isInteger(usage.cache_read_input_tokens)
      ? { cacheReadInputTokens: usage.cache_read_input_tokens as number }
      : {}),
  });
}
function parseStopReason(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as AnthropicMessageResponse;
    return typeof parsed.stop_reason === "string" ? parsed.stop_reason : null;
  } catch {
    return null;
  }
}
function parseTextOutput(body: string): {
  output: string;
  usage?: TextOnlyProviderUsage;
  respondedModel?: string;
} | null {
  try {
    const parsed = JSON.parse(body) as AnthropicMessageResponse;
    if (!Array.isArray(parsed.content)) return null;
    const texts = parsed.content.flatMap((block) =>
      typeof block === "object" &&
      block !== null &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
        ? [(block as { text: string }).text]
        : [],
    );
    if (texts.length === 0) return null;
    const output = texts.join("");
    if (byteLength(output) > MAX_TEXT_ONLY_OUTPUT_BYTES) return null;
    const usage = parseUsage(parsed.usage);
    const respondedModel =
      typeof parsed.model === "string" && parsed.model.trim().length > 0
        ? parsed.model
        : undefined;
    return {
      output,
      ...(usage === undefined ? {} : { usage }),
      ...(respondedModel === undefined ? {} : { respondedModel }),
    };
  } catch {
    return null;
  }
}
/** Direct Anthropic Messages API adapter with no tools or project capabilities. */
export function createAnthropicApiProvider(
  options: AnthropicApiProviderOptions = {},
): TextOnlyProvider {
  const environment = options.environment ?? process.env;
  const transport = options.transport ?? defaultTransport;
  const maxOutputTokens =
    options.maxOutputTokens ?? MAX_TEXT_ONLY_OUTPUT_TOKENS;
  const now = options.now ?? Date.now;
  if (!validOutputTokenLimit(maxOutputTokens))
    throw new TypeError("Anthropic API output token limit is invalid.");
  return Object.freeze({
    async invoke(
      input: TextOnlyProviderInput,
    ): Promise<TextOnlyProviderResult> {
      const startedAt = now();
      const model = validModel(input.model) ? input.model.trim() : null;
      if (!validString(input.systemPrompt, MAX_TEXT_ONLY_SYSTEM_PROMPT_BYTES))
        return failure(
          model,
          "invalid_system_prompt",
          "System prompt is invalid.",
          now() - startedAt,
        );
      if (!validString(input.contextJson, MAX_TEXT_ONLY_CONTEXT_BYTES))
        return failure(
          model,
          "invalid_context_json",
          "Context JSON is invalid.",
          now() - startedAt,
        );
      if (model === null)
        return failure(
          null,
          "invalid_model",
          "Model is invalid.",
          now() - startedAt,
        );
      if (!validTimeout(input.timeoutMs))
        return failure(
          model,
          "invalid_timeout",
          "Timeout is invalid.",
          now() - startedAt,
        );
      if (!validOutputSchema(input.outputSchema))
        return failure(
          model,
          "provider_response_invalid",
          "Output schema is invalid.",
          now() - startedAt,
        );
      if (!validEffort(input.effort))
        return failure(
          model,
          "invalid_effort",
          "Effort is invalid.",
          now() - startedAt,
        );
      const apiKey = environment.ANTHROPIC_API_KEY?.trim();
      if (!apiKey)
        return failure(
          model,
          "credential_unavailable",
          "Anthropic API credential is unavailable.",
          now() - startedAt,
        );
      const sleep = options.sleep ?? defaultSleep;
      const outputConfig = {
        ...(input.outputSchema === undefined
          ? {}
          : {
              format: {
                type: "json_schema" as const,
                schema: toAnthropicOutputSchema(input.outputSchema.schema),
              },
            }),
        ...(input.effort === undefined ? {} : { effort: input.effort }),
      };
      const body = {
        model,
        system: input.systemPrompt,
        messages: [{ role: "user", content: input.contextJson }],
        max_tokens: maxOutputTokens,
        tool_choice: { type: "none" as const },
        ...(Object.keys(outputConfig).length === 0
          ? {}
          : { output_config: outputConfig }),
      };
      const requestBody = JSON.stringify(body);
      // Retries stay inside the caller's original timeout budget: each
      // attempt's AbortController is armed with whatever remains until
      // `deadlineAt`, never with a fresh full `input.timeoutMs`, so a
      // retried call cannot silently take longer overall than a
      // non-retried one was already bounded to.
      const deadlineAt = startedAt + input.timeoutMs;
      for (let attempt = 1; attempt <= ANTHROPIC_MAX_ATTEMPTS; attempt++) {
        const remainingBudgetMs = deadlineAt - now();
        if (remainingBudgetMs <= 0)
          return failure(
            model,
            "provider_timeout",
            "Anthropic API request timed out.",
            now() - startedAt,
            false,
            {},
            attempt - 1,
          );
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          Math.min(input.timeoutMs, remainingBudgetMs),
        );
        try {
          const response = await transport(
            Object.freeze({
              url: ANTHROPIC_MESSAGES_URL,
              method: "POST",
              headers: Object.freeze({
                "content-type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": ANTHROPIC_VERSION,
              }),
              body: requestBody,
              signal: controller.signal,
            }),
          );
          // The Anthropic Messages API returns a `request-id` response
          // header on every response, success or failure. It is a
          // diagnostic identifier only (never a secret, never a Loop
          // Engine business identifier). Only the last attempt's request
          // ID is kept — sufficient for diagnosing the outcome actually
          // returned to the caller, without accumulating a list.
          const requestId = boundedString(
            response.headers.get("request-id") ?? undefined,
            256,
          );
          const raw = await readBoundedResponseBody(response);
          if (raw.exceeded)
            return failure(
              model,
              "output_limit_exceeded",
              "Anthropic API response exceeded the output limit.",
              now() - startedAt,
              true,
              { ...(requestId === undefined ? {} : { requestId }) },
              attempt,
            );
          if (!response.ok) {
            const code = httpFailureCode(response.status);
            const delayMs = anthropicRetryDelayMs(
              attempt,
              response.headers.get("retry-after"),
            );
            const canRetry =
              ANTHROPIC_RETRYABLE_HTTP_STATUSES.has(response.status) &&
              attempt < ANTHROPIC_MAX_ATTEMPTS &&
              delayMs < deadlineAt - now();
            if (canRetry) {
              await sleep(delayMs);
              continue;
            }
            return failure(
              model,
              code,
              "Anthropic API request failed.",
              now() - startedAt,
              false,
              {
                httpStatus: response.status,
                ...parseAnthropicError(raw.body),
                // The response header is more reliable than the JSON error
                // envelope's `request_id` field (always present, not
                // dependent on a well-formed body), so it wins when both
                // are available.
                ...(requestId === undefined ? {} : { requestId }),
              },
              attempt,
            );
          }
          const stopReason = parseStopReason(raw.body);
          if (stopReason === "refusal")
            return failure(
              model,
              "provider_refused",
              "Anthropic API refused the request.",
              now() - startedAt,
              false,
              { ...(requestId === undefined ? {} : { requestId }) },
              attempt,
            );
          if (stopReason === "max_tokens")
            return failure(
              model,
              "provider_output_truncated",
              "Anthropic API response was truncated by the output token limit.",
              now() - startedAt,
              true,
              { ...(requestId === undefined ? {} : { requestId }) },
              attempt,
            );
          const parsed = parseTextOutput(raw.body);
          if (parsed === null)
            return failure(
              model,
              "provider_response_invalid",
              "Anthropic API response was invalid.",
              now() - startedAt,
              false,
              { ...(requestId === undefined ? {} : { requestId }) },
              attempt,
            );
          return Object.freeze({
            status: "completed",
            provider: "anthropic_api",
            model,
            output: parsed.output,
            durationMs: now() - startedAt,
            truncated: false,
            attempts: attempt,
            ...(parsed.usage === undefined
              ? {}
              : {
                  usage: parsed.usage,
                  costUsd: costUsdForUsage(
                    model,
                    parsed.usage,
                    new Date(now()).toISOString().slice(0, 10),
                  ),
                }),
            ...(input.effort === undefined ? {} : { effort: input.effort }),
            ...(parsed.respondedModel === undefined
              ? {}
              : { respondedModel: parsed.respondedModel }),
            ...(requestId === undefined ? {} : { requestId }),
          });
        } catch {
          return failure(
            model,
            controller.signal.aborted
              ? "provider_timeout"
              : "provider_unavailable",
            controller.signal.aborted
              ? "Anthropic API request timed out."
              : "Anthropic API request could not be completed.",
            now() - startedAt,
            false,
            {},
            attempt,
          );
        } finally {
          clearTimeout(timeout);
        }
      }
      // Unreachable: every loop iteration above either returns or retries
      // within the fixed ANTHROPIC_MAX_ATTEMPTS bound, so this is a
      // defensive, never-hit fallback rather than a live code path.
      return failure(
        model,
        "provider_unavailable",
        "Anthropic API request could not be completed.",
        now() - startedAt,
        false,
        {},
        ANTHROPIC_MAX_ATTEMPTS,
      );
    },
  });
}
