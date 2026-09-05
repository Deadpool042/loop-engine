const SUBSCRIPTION_CLI_ENV_KEYS = [
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "PATH",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "COLORTERM",
  "NO_COLOR",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "CODEX_HOME",
  "CLAUDE_CONFIG_DIR",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
] as const;

const TEST_ONLY_PREFIXES = ["FAKE_CODEX_", "FAKE_CLAUDE_"] as const;

export function buildSubscriptionCliEnvironment(
  parent: NodeJS.ProcessEnv = process.env,
  extra: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  for (const key of SUBSCRIPTION_CLI_ENV_KEYS) {
    const value = parent[key];
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(parent)) {
    if (
      typeof value === "string" &&
      TEST_ONLY_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(extra)) {
    env[key] = value;
  }

  return env;
}
