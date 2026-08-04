import {
  parseProjectContextReport,
  type ProjectContextReport,
} from "../shared/project-context.js";
import { runLoopCliJsonCommand } from "./loop-cli-json-command.js";
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
    return runLoopCliJsonCommand(
      this.runner,
      repoPath,
      projectName,
      ["src/cli.ts", "context", projectName, "--json"],
      parseProjectContextReport,
      "context",
    );
  }
}
