// Shared execution path for the fixed, hard-coded Loop CLI JSON commands
// (context, prompt, review, run --mode plan, validate). Each caller supplies
// its own literal args array and parser — this module never builds a
// command, executable, or mode from caller-supplied data beyond
// repoPath/projectName.
//
// Every failure mode (spawn couldn't start, non-zero exit, unparseable
// output) is classified into a GuiExecutionError and thrown as an Error
// whose message carries the encoded form — see
// gui/shared/gui-execution-error.ts for why (the IPC boundary only
// preserves Error.message). Existing plain-substring regex assertions on
// caller error messages keep matching: the classified error's `details`
// field always carries the original raw text verbatim.
import { join } from "node:path";

import { encodeGuiExecutionError } from "../shared/gui-execution-error.js";
import type { ProcessRunner } from "./process-runner.js";

export async function runLoopCliJsonCommand<T>(
  runner: ProcessRunner,
  repoPath: string,
  projectName: string,
  args: readonly string[],
  parse: (raw: string) => T,
  commandLabel: string,
): Promise<T> {
  if (typeof repoPath !== "string" || repoPath.trim().length === 0) {
    throw new TypeError("repoPath must be a non-empty string");
  }

  if (typeof projectName !== "string" || projectName.trim().length === 0) {
    throw new TypeError("projectName must be a non-empty string");
  }

  const executable = join(
    repoPath,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );

  let result: Awaited<ReturnType<ProcessRunner["run"]>>;
  try {
    result = await runner.run({ executable, args, cwd: repoPath });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      encodeGuiExecutionError({
        kind: "process_start_failed",
        message: `Impossible de démarrer la commande Loop CLI ${commandLabel}.`,
        details,
      }),
    );
  }

  if (result.exitCode !== 0) {
    const details =
      result.stderr.trim() ||
      result.stdout.trim() ||
      `exit code ${result.exitCode}`;
    throw new Error(
      encodeGuiExecutionError({
        kind: "process_exit_failed",
        message: `La commande Loop CLI ${commandLabel} a échoué.`,
        details,
        exitCode: result.exitCode,
      }),
    );
  }

  try {
    return parse(result.stdout.trim());
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      encodeGuiExecutionError({
        kind: "invalid_output",
        message: `La commande Loop CLI ${commandLabel} a renvoyé une sortie invalide.`,
        details,
      }),
    );
  }
}
