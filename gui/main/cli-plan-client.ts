import {
  parseProjectPlanReport,
  type ProjectPlanReport,
} from "../shared/project-plan.js";
import { runLoopCliJsonCommand } from "./loop-cli-json-command.js";
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
    return runLoopCliJsonCommand(
      this.runner,
      repoPath,
      projectName,
      ["src/cli.ts", "run", projectName, "--mode", "plan", "--json"],
      parseProjectPlanReport,
      "run",
    );
  }
}
