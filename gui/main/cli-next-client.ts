import { join } from "node:path";

import {
  parseProjectNextReport,
  type ProjectNextReport,
} from "../shared/project-next.js";
import type { ProcessRunner } from "./process-runner.js";

export interface LoopCliNextClient {
  loadProjectNext(
    repoPath: string,
    projectName: string,
  ): Promise<ProjectNextReport>;
}

export class DefaultLoopCliNextClient implements LoopCliNextClient {
  constructor(private readonly runner: ProcessRunner) {}

  async loadProjectNext(
    repoPath: string,
    projectName: string,
  ): Promise<ProjectNextReport> {
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

    const result = await this.runner.run({
      executable,
      args: ["src/cli.ts", "next", projectName, "--json"],
      cwd: repoPath,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() ||
          `Loop CLI next failed with exit code ${result.exitCode}`,
      );
    }

    return parseProjectNextReport(result.stdout.trim());
  }
}
