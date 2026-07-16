export type JsonErrorCode =
  | "missing_project"
  | "unknown_project"
  | "missing_query"
  | "missing_index"
  | "missing_mode_value"
  | "unknown_mode"
  | "mode_not_implemented";

export function printJsonError(code: JsonErrorCode, message: string): void {
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      ok: false,
      error: {
        code,
        message,
      },
    }),
  );
}
