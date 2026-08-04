import {
  parseProjectReviewReport,
  type ProjectReviewReport,
} from "../shared/project-review.js";
import { runLoopCliJsonCommand } from "./loop-cli-json-command.js";
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
    return runLoopCliJsonCommand(
      this.runner,
      repoPath,
      projectName,
      ["src/cli.ts", "review", projectName, "--json"],
      parseProjectReviewReport,
      "review",
    );
  }
}
