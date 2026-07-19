/** A declarative, runtime-neutral request derived from Execution Bridge evidence. */
export type RuntimeRequestInput = Readonly<{
  id: string;
  version: string;
  createdAt: string;
  bridge: Readonly<{
    id: string;
    version: string;
    ready: boolean;
    executionAllowed: false;
    executionStarted: false;
  }>;
  evidenceReferences: readonly string[];
}>;

export const RUNTIME_REQUEST_ERROR_CODES = [
  "runtime_request_missing",
  "runtime_request_invalid",
  "runtime_request_bridge_missing",
  "runtime_request_bridge_invalid",
] as const;
export type RuntimeRequestErrorCode = (typeof RUNTIME_REQUEST_ERROR_CODES)[number];
export type RuntimeRequestError = Readonly<{
  code: RuntimeRequestErrorCode;
  message: string;
  executionAllowed: false;
  executionStarted: false;
}>;

export type RuntimeRequestResult = Readonly<{
  input: RuntimeRequestInput;
  diagnostics: readonly RuntimeRequestError[];
  valid: boolean;
  requestConstructible: boolean;
  executionAllowed: false;
  executionStarted: false;
}>;
