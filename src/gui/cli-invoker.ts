import { execFile } from "node:child_process";

export type CliInvocationSuccess = Readonly<{
  ok: true;
  json: unknown;
  exitCode: number;
}>;

export type CliInvocationFailure = Readonly<{
  ok: false;
  kind: "spawn-error" | "cancelled";
  raw: string;
}>;

export type CliInvocationResult = CliInvocationSuccess | CliInvocationFailure;

type ExecuteResult = Readonly<{
  stdout: string;
  stderr: string;
  exitCode: number;
}>;

type ExecuteCli = (
  executable: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  env?: Readonly<Record<string, string>>,
) => Promise<ExecuteResult>;

function executeCliProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  env?: Readonly<Record<string, string>>,
): Promise<ExecuteResult> {
  return new Promise((resolve, reject) => {
    execFile(
      executable,
      [...args],
      {
        cwd,
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 20 * 1024 * 1024,
        ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr, exitCode: 0 });
          return;
        }

        const candidate = error as NodeJS.ErrnoException & {
          code?: string | number;
          killed?: boolean;
          stdout?: string;
          stderr?: string;
        };

        if (candidate.code === "ETIMEDOUT" || candidate.killed) {
          reject(new Error("CLI invocation timed out."));
          return;
        }

        if (typeof candidate.code === "number") {
          resolve({
            stdout: candidate.stdout ?? stdout,
            stderr: candidate.stderr ?? stderr,
            exitCode: candidate.code,
          });
          return;
        }

        reject(error);
      },
    );
  });
}

export type CliInvoker = Readonly<{
  invoke: (
    command: string,
    args: readonly string[],
    cwd: string,
    env?: Readonly<Record<string, string>>,
  ) => Promise<CliInvocationResult>;
}>;

export function createCliInvoker(options: {
  executable?: string;
  timeoutMs?: number;
  execute?: ExecuteCli;
} = {}): CliInvoker {
  const executable = options.executable ?? "pnpm";
  const timeoutMs = options.timeoutMs ?? 15_000;
  const execute = options.execute ?? executeCliProcess;

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("GUI CLI timeout must be a positive integer.");
  }

  return Object.freeze({
    async invoke(command, args, cwd, env) {
      const invocationArgs = ["--silent", "loop", command, ...args, "--json"];

      try {
        const result = await execute(executable, invocationArgs, cwd, timeoutMs, env);
        try {
          return Object.freeze({
            ok: true as const,
            json: JSON.parse(result.stdout) as unknown,
            exitCode: result.exitCode,
          });
        } catch {
          return Object.freeze({
            ok: false as const,
            kind: "spawn-error" as const,
            raw: result.stderr || result.stdout || "CLI returned invalid JSON.",
          });
        }
      } catch (error) {
        return Object.freeze({
          ok: false as const,
          kind: "spawn-error" as const,
          raw: error instanceof Error ? error.message : "CLI invocation failed.",
        });
      }
    },
  });
}
