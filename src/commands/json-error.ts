export type JsonErrorCode =
  | "missing_project"
  | "unknown_project"
  | "missing_query"
  | "missing_index"
  | "missing_mode_value"
  | "missing_max_repairs_value"
  | "invalid_max_repairs"
  | "unknown_mode"
  | "mode_not_implemented"
  | "invalid_provider_timeout"
  | "unsupported_provider"
  | "missing_provider_executable"
  | "invalid_provider_executable"
  | "agent_policy_rejected"
  | "missing_commit_message";

export function printJsonError(code: JsonErrorCode, message: string): void {
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      ok: false,
      error: { code, message },
    }),
  );
}
