import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type GuiConfig = Readonly<{
  repositoryPath: string | null;
}>;

export type GuiConfigStore = Readonly<{
  read: () => GuiConfig;
  write: (config: GuiConfig) => void;
}>;

const DEFAULT_GUI_CONFIG: GuiConfig = Object.freeze({ repositoryPath: null });

function isGuiConfig(value: unknown): value is GuiConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(candidate).length === 1 &&
    (candidate.repositoryPath === null ||
      typeof candidate.repositoryPath === "string")
  );
}

export function createGuiConfigStore(configPath: string): GuiConfigStore {
  return Object.freeze({
    read() {
      if (!existsSync(configPath)) return DEFAULT_GUI_CONFIG;
      try {
        const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
        return isGuiConfig(parsed)
          ? Object.freeze({ repositoryPath: parsed.repositoryPath })
          : DEFAULT_GUI_CONFIG;
      } catch {
        return DEFAULT_GUI_CONFIG;
      }
    },
    write(config) {
      if (!isGuiConfig(config)) {
        throw new Error("Invalid GUI configuration.");
      }
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, `${JSON.stringify(config)}\n`, "utf8");
    },
  });
}
