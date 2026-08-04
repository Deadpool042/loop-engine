import { join } from "node:path";

import {
  parseProjectReviewReport,
  type ProjectReviewReport,
} from "../shared/project-review.js";
import type { ProcessRunner } from "./process-runner.js";

export interface LoopCliReviewClient {
  loadProjectReview(
    repoPath: string,
    projectName: string,
  ): Promise<ProjectReviewReport>;
}

export class DefaultLoopCliReviewClient implements LoopCliReviewClient {
  constructor(private readonly runner: ProcessRunner) {}

  async loadProjectReview(
    repoPath: string,
    projectName: string,
  ): Promise<ProjectReviewReport> {
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
      args: ["src/cli.ts", "review", projectName, "--json"],
      cwd: repoPath,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() ||
          `Loop CLI review failed with exit code ${result.exitCode}`,
      );
    }

    return parseProjectReviewReport(result.stdout.trim());
  }
}
