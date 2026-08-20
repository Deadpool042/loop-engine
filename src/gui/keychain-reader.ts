import { execFile } from "node:child_process";
import { userInfo } from "node:os";

export const PROVIDER_KEYCHAIN_SERVICE = "loop-engine-anthropic-api";
const KEYCHAIN_READ_TIMEOUT_MS = 5_000;
const MAX_SECRET_BYTES = 4 * 1024;

export type ProviderApiKeyResult =
  | Readonly<{ ok: true; apiKey: string }>
  | Readonly<{ ok: false; reason: "unavailable" | "read_failed" | "invalid" }>;

type ExecuteSecurity = (
  args: readonly string[],
  timeoutMs: number,
) => Promise<Readonly<{ stdout: string; exitCode: number }>>;

function defaultExecuteSecurity(
  args: readonly string[],
  timeoutMs: number,
): Promise<Readonly<{ stdout: string; exitCode: number }>> {
  return new Promise((resolve, reject) => {
    execFile(
      "/usr/bin/security",
      [...args],
      { encoding: "utf8", timeout: timeoutMs, maxBuffer: MAX_SECRET_BYTES + 1 },
      (error, stdout) => {
        if (!error) {
          resolve({ stdout, exitCode: 0 });
          return;
        }
        const candidate = error as NodeJS.ErrnoException & {
          code?: string | number;
          killed?: boolean;
        };
        if (candidate.code === "ETIMEDOUT" || candidate.killed) {
          reject(new Error("Keychain read timed out."));
          return;
        }
        if (typeof candidate.code === "number") {
          resolve({ stdout: "", exitCode: candidate.code });
          return;
        }
        reject(error);
      },
    );
  });
}

export type ProviderKeychainReader = Readonly<{
  read: () => Promise<ProviderApiKeyResult>;
}>;

export function createProviderKeychainReader(options: {
  account?: () => string;
  execute?: ExecuteSecurity;
} = {}): ProviderKeychainReader {
  const account = options.account ?? (() => userInfo().username);
  const execute = options.execute ?? defaultExecuteSecurity;

  return Object.freeze({
    async read(): Promise<ProviderApiKeyResult> {
      let accountName: string;
      try {
        accountName = account();
      } catch {
        return Object.freeze({ ok: false as const, reason: "read_failed" as const });
      }

      try {
        const result = await execute(
          [
            "find-generic-password",
            "-s",
            PROVIDER_KEYCHAIN_SERVICE,
            "-a",
            accountName,
            "-w",
          ],
          KEYCHAIN_READ_TIMEOUT_MS,
        );

        if (result.exitCode !== 0) {
          return Object.freeze({ ok: false as const, reason: "unavailable" as const });
        }

        const apiKey = result.stdout.trim();
        if (
          apiKey.length === 0 ||
          Buffer.byteLength(apiKey, "utf8") > MAX_SECRET_BYTES
        ) {
          return Object.freeze({ ok: false as const, reason: "invalid" as const });
        }

        return Object.freeze({ ok: true as const, apiKey });
      } catch {
        return Object.freeze({ ok: false as const, reason: "read_failed" as const });
      }
    },
  });
}
