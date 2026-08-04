// Real filesystem-backed ConfigIO, wired only from main.ts (Electron's
// privileged process). Writes exclusively under the given baseDir — in
// production this is app.getPath("userData"), never the Loop Engine repo.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ConfigIO } from "./config-store.js";

const CONFIG_FILE_NAME = "gui-config.json";

export class FsConfigIO implements ConfigIO {
  private readonly filePath: string;

  constructor(private readonly baseDir: string) {
    this.filePath = join(baseDir, CONFIG_FILE_NAME);
  }

  async read(): Promise<string | null> {
    try {
      return await readFile(this.filePath, "utf8");
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async write(contents: string): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(this.filePath, contents, "utf8");
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "ENOENT";
}
