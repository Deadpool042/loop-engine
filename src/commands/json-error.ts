export type JsonErrorCode =
  | "missing_project"
  | "unknown_project"
  | "missing_query"
  | "missing_index";

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
