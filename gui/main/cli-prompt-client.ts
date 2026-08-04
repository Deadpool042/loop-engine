import { join } from "node:path";

import {
  parseProjectPromptReport,
  type ProjectPromptReport,
} from "../shared/project-prompt.js";
import type { ProcessRunner } from "./process-runner.js";

export interface LoopCliPromptClient {
  loadProjectPrompt(
    repoPath: string,
    projectName: string,
  ): Promise<ProjectPromptReport>;
}

export class DefaultLoopCliPromptClient implements LoopCliPromptClient {
  constructor(private readonly runner: ProcessRunner) {}

  async loadProjectPrompt(
    repoPath: string,
    projectName: string,
  ): Promise<ProjectPromptReport> {
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
      args: ["src/cli.ts", "prompt", projectName, "--json"],
      cwd: repoPath,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() ||
          `Loop CLI prompt failed with exit code ${result.exitCode}`,
      );
    }

    return parseProjectPromptReport(result.stdout.trim());
  }
}
