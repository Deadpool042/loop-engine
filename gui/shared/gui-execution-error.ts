// Neutral, GUI-internal transport error model. Distinguishes only the
// mechanical failure shape (spawn failed to start, process exited non-zero,
// output couldn't be parsed) — never a business/domain code. See
// docs/architecture/gui-cockpit.md decision 17.
//
// Electron's contextBridge/ipcRenderer only preserves an Error's `.message`
// string across the main<->renderer boundary (custom fields are dropped).
// To carry structure across that boundary anyway, the structured error is
// JSON-encoded behind a marker inside the thrown Error's message, and
// decoded back on the renderer side. Any error that does not carry the
// marker (a genuinely unexpected native failure) falls back to a generic
// invalid_output wrapper — the renderer never sees a raw system object.
export type GuiExecutionError =
  | Readonly<{
      kind: "process_start_failed";
      message: string;
      details: string;
    }>
  | Readonly<{
      kind: "process_exit_failed";
      message: string;
      details: string;
      exitCode: number;
    }>
  | Readonly<{
      kind: "invalid_output";
      message: string;
      details: string;
    }>;

const MARKER = "GUI_EXECUTION_ERROR::";

export function encodeGuiExecutionError(error: GuiExecutionError): string {
  return MARKER + JSON.stringify(error);
}

export function decodeGuiExecutionError(
  message: string,
): GuiExecutionError | null {
  const index = message.indexOf(MARKER);

  if (index === -1) {
    return null;
  }

  const payload = message.slice(index + MARKER.length);

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  return isGuiExecutionError(parsed) ? parsed : null;
}

export function toGuiExecutionError(error: unknown): GuiExecutionError {
  const message = error instanceof Error ? error.message : String(error);
  const decoded = decodeGuiExecutionError(message);

  if (decoded) {
    return decoded;
  }

  return {
    kind: "invalid_output",
    message: "Impossible d'exécuter la commande.",
    details: message,
  };
}

function isGuiExecutionError(value: unknown): value is GuiExecutionError {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.message !== "string" ||
    typeof record.details !== "string"
  ) {
    return false;
  }

  if (record.kind === "process_start_failed" || record.kind === "invalid_output") {
    return true;
  }

  if (record.kind === "process_exit_failed") {
    return typeof record.exitCode === "number";
  }

  return false;
}
