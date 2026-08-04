// GuiConfigStore — persists the GUI's own local configuration (currently
// only the configured Loop Engine repo path). Deliberately separate from
// projects.yaml and everything under src/: the GUI never writes into the
// Loop Engine repo (decision 16, gui-cockpit.md §16).
//
// The filesystem is injected via ConfigIO so this class is testable with
// an in-memory fake — see gui/tests/config-store.test.ts.

export interface GuiConfig {
  readonly repoPath: string | null;
}

export interface ConfigIO {
  /** Returns the raw file contents, or null if the config file does not exist. */
  read(): Promise<string | null>;
  write(contents: string): Promise<void>;
}

const EMPTY_CONFIG: GuiConfig = { repoPath: null };

export class GuiConfigStore {
  constructor(private readonly io: ConfigIO) {}

  async load(): Promise<GuiConfig> {
    const raw = await this.io.read();
    if (raw === null) {
      return EMPTY_CONFIG;
    }
    return parseConfig(raw);
  }

  async saveRepoPath(repoPath: string): Promise<GuiConfig> {
    if (typeof repoPath !== "string" || repoPath.trim().length === 0) {
      throw new TypeError("repoPath must be a non-empty string");
    }
    const config: GuiConfig = { repoPath };
    await this.io.write(JSON.stringify(config, null, 2));
    return config;
  }
}

function parseConfig(raw: string): GuiConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_CONFIG;
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "repoPath" in parsed &&
    (typeof (parsed as { repoPath: unknown }).repoPath === "string" ||
      (parsed as { repoPath: unknown }).repoPath === null)
  ) {
    return { repoPath: (parsed as { repoPath: string | null }).repoPath };
  }
  return EMPTY_CONFIG;
}
