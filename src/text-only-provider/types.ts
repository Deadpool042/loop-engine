export const MAX_TEXT_ONLY_CONTEXT_BYTES = 96 * 1024;
export const MAX_TEXT_ONLY_SYSTEM_PROMPT_BYTES = 16 * 1024;
export const MAX_TEXT_ONLY_MODEL_CHARACTERS = 256;
export const MIN_TEXT_ONLY_TIMEOUT_MS = 1_000;
export const MAX_TEXT_ONLY_TIMEOUT_MS = 120_000;
export const MAX_TEXT_ONLY_OUTPUT_BYTES = 32 * 1024;
export const MAX_TEXT_ONLY_OUTPUT_TOKENS = 1_024;

export const TEXT_ONLY_PROVIDER_FAILURE_CODES = [
  "invalid_system_prompt",
  "invalid_context_json",
  "invalid_model",
  "invalid_timeout",
  "credential_unavailable",
  "provider_timeout",
  "provider_unavailable",
  "provider_request_failed",
  "provider_authentication_failed",
  "provider_response_invalid",
  "output_limit_exceeded",
] as const;

export type TextOnlyProviderFailureCode =
  (typeof TEXT_ONLY_PROVIDER_FAILURE_CODES)[number];

/**
 * Minimal consultation-only input. It deliberately cannot express a project
 * path, current directory, worktree, tool, shell, Git, MCP, or filesystem
 * capability.
 */
export type TextOnlyProviderInput = Readonly<{
  systemPrompt: string;
  contextJson: string;
  model: string;
  timeoutMs: number;
}>;

export type TextOnlyProviderUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
}>;

export type TextOnlyProviderSuccess = Readonly<{
  status: "completed";
  provider: string;
  model: string;
  output: string;
  durationMs: number;
  truncated: false;
  usage?: TextOnlyProviderUsage;
}>;

export type TextOnlyProviderFailure = Readonly<{
  status: "failed";
  provider: string;
  model: string | null;
  code: TextOnlyProviderFailureCode;
  message: string;
  durationMs: number;
  truncated: boolean;
}>;

export type TextOnlyProviderResult =
  | TextOnlyProviderSuccess
  | TextOnlyProviderFailure;

export interface TextOnlyProvider {
  invoke(input: TextOnlyProviderInput): Promise<TextOnlyProviderResult>;
}
