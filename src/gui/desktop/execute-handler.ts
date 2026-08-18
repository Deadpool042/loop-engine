import { existsSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

import type { CliInvocationResult, CliInvoker } from "../cli-invoker.js";

export const DESKTOP_EXECUTE_CLI_TIMEOUT_MS = 900_000;

export const APPROVED_DESKTOP_EXECUTE_PROVIDERS = Object.freeze({
  codex: Object.freeze({
    executable: "codex",
    timeoutMs: 300_000,
    models: Object.freeze(["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"]),
  }),
  claude_code: Object.freeze({
    executable: "claude",
    timeoutMs: 600_000,
    models: Object.freeze(["claude-haiku-4-5", "claude-sonnet-5"]),
  }),
});

export type DesktopExecuteProvider = keyof typeof APPROVED_DESKTOP_EXECUTE_PROVIDERS;

export type DesktopExecuteRequest = Readonly<{
  projectName: string;
  candidateId: string;
  provider: DesktopExecuteProvider;
  model: string;
}>;

function patchFileSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : fallback;
}

export function defaultPatchFilename(
  projectName: string,
  candidateId: string,
): string {
  return `${patchFileSegment(projectName, "project")}-${patchFileSegment(candidateId, "candidate")}.patch`;
}

function isDesktopExecuteRequest(value: unknown): value is DesktopExecuteRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.projectName === "string" &&
    typeof request.candidateId === "string" &&
    typeof request.model === "string" &&
    (request.provider === "codex" || request.provider === "claude_code") &&
    APPROVED_DESKTOP_EXECUTE_PROVIDERS[request.provider].models.includes(request.model)
  );
}

function failure(kind: "spawn-error" | "cancelled", raw: string): CliInvocationResult {
  return Object.freeze({ ok: false as const, kind, raw });
}

export function createExecuteHandler(options: {
  cliInvoker: CliInvoker;
  resolveRepositoryPath: () => string | null;
  choosePatchDestination: (defaultPath: string) => Promise<string | null>;
  destinationExists?: (path: string) => boolean;
  parentDirectoryExists?: (path: string) => boolean;
}): (request: unknown) => Promise<CliInvocationResult> {
  const destinationExists = options.destinationExists ?? existsSync;
  const parentDirectoryExists = options.parentDirectoryExists ?? existsSync;

  return async (request) => {
    if (!isDesktopExecuteRequest(request)) {
      return failure("spawn-error", "Invalid execute request.");
    }

    const repositoryPath = options.resolveRepositoryPath();
    if (repositoryPath === null) {
      return failure("spawn-error", "Loop Engine repository could not be resolved.");
    }

    const destinationPath = await options.choosePatchDestination(
      defaultPatchFilename(request.projectName, request.candidateId),
    );
    if (destinationPath === null) {
      return failure("cancelled", "Patch destination selection was cancelled.");
    }
    if (!isAbsolute(destinationPath) || !parentDirectoryExists(dirname(destinationPath))) {
      return failure("spawn-error", "Patch destination parent directory is unavailable.");
    }
    if (destinationExists(destinationPath)) {
      return failure("spawn-error", "Patch destination already exists.");
    }

    const provider = APPROVED_DESKTOP_EXECUTE_PROVIDERS[request.provider];
    return options.cliInvoker.invoke(
      "run",
      [
        request.projectName,
        "--candidate",
        request.candidateId,
        "--mode",
        "execute",
        "--provider",
        request.provider,
        "--provider-executable",
        provider.executable,
        "--provider-model",
        request.model,
        "--provider-timeout-ms",
        String(provider.timeoutMs),
        "--export-patch",
        destinationPath,
      ],
      repositoryPath,
    );
  };
}
