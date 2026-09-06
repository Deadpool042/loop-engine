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
  | "auto_subscription_requires_execute"
  | "auto_subscription_requires_candidate"
  | "auto_subscription_requires_git_head"
  | "auto_subscription_conflict"
  | "candidate_not_canonical"
  | "git_head_changed"
  | "auto_subscription_requires_execution_decision"
  | "auto_subscription_authorization_blocked"
  | "auto_subscription_candidate_mismatch"
  | "auto_subscription_requires_brief"
  | "auto_subscription_requires_detailed_brief"
  | "auto_subscription_decision_timeout"
  | "auto_subscription_decision_output_limit"
  | "auto_subscription_decision_provider_failed"
  | "auto_subscription_decision_invalid_output"
  | "auto_subscription_decision_invalid_scope"
  | "auto_subscription_decision_write_failed"
  | "auto_subscription_decision_post_write_invalid"
  | "auto_subscription_decision_recovery_failed"
  | "auto_subscription_decision_commit_failed"
  | "missing_run_history_limit_value"
  | "invalid_run_history_limit"
  | "missing_run_history_run_id"
  | "run_history_lookup_with_limit"
  | "missing_candidate_run_id"
  | "missing_project_type"
  | "brief_approval_required"
  | "project_registration_failed";

export function printJsonError(code: JsonErrorCode, message: string): void {
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      ok: false,
      error: { code, message },
    }),
  );
}
