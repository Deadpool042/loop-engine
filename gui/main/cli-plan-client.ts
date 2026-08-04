import { join } from "node:path";

import {
  parseProjectPlanReport,
  type ProjectPlanReport,
} from "../shared/project-plan.js";
import type { ProcessRunner } from "./process-runner.js";

export interface LoopCliPlanClient {
  loadProjectPlan(
    repoPath: string,
    projectName: string,
  ): Promise<ProjectPlanReport>;
}

export class DefaultLoopCliPlanClient implements LoopCliPlanClient {
  constructor(private readonly runner: ProcessRunner) {}

  async loadProjectPlan(
    repoPath: string,
    projectName: string,
  ): Promise<ProjectPlanReport> {
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
      args: ["src/cli.ts", "run", projectName, "--mode", "plan", "--json"],
      cwd: repoPath,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() ||
          `Loop CLI run failed with exit code ${result.exitCode}`,
      );
    }

    return parseProjectPlanReport(result.stdout.trim());
  }
}
