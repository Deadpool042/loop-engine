export type JsonErrorCode =
  | "missing_project"
  | "unknown_project"
  | "missing_query"
  | "missing_index"
  | "missing_mode_value"
  | "missing_candidate_value"
  | "candidate_plan_or_execute_only"
  | "missing_max_repairs_value"
  | "invalid_max_repairs"
  | "unknown_mode"
  | "mode_not_implemented"
  | "invalid_provider_timeout"
  | "unsupported_provider"
  | "missing_provider_executable"
  | "publish_requires_provider"
  | "missing_provider_model"
  | "invalid_provider_executable"
  | "agent_policy_rejected"
  | "missing_commit_message"
  | "missing_export_patch_value"
  | "export_patch_execute_only"
  | "export_patch_requires_provider"
  | "progress_events_execute_json_only"
  | "invalid_provider_effort"
  | "provider_effort_requires_provider_model"
  | "missing_run_history_limit_value"
  | "invalid_run_history_limit"
  | "missing_candidate_run_id";

export function printJsonError(code: JsonErrorCode, message: string): void {
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      ok: false,
      error: { code, message },
    }),
  );
}
