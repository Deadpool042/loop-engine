import { join } from "node:path";

import {
  parseProjectContextReport,
  type ProjectContextReport,
} from "../shared/project-context.js";
import type { ProcessRunner } from "./process-runner.js";

export interface LoopCliContextClient {
  loadProjectContext(
    repoPath: string,
    projectName: string,
  ): Promise<ProjectContextReport>;
}

export class DefaultLoopCliContextClient implements LoopCliContextClient {
  constructor(private readonly runner: ProcessRunner) {}

  async loadProjectContext(
    repoPath: string,
    projectName: string,
  ): Promise<ProjectContextReport> {
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
      args: ["src/cli.ts", "context", projectName, "--json"],
      cwd: repoPath,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() ||
          `Loop CLI context failed with exit code ${result.exitCode}`,
      );
    }

    return parseProjectContextReport(result.stdout.trim());
  }
}
