import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function docExists(projectPath: string, docPath: string): boolean {
  return existsSync(resolve(projectPath, docPath));
}
