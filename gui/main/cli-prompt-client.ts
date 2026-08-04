import {
  parseProjectPromptReport,
  type ProjectPromptReport,
} from "../shared/project-prompt.js";
import { runLoopCliJsonCommand } from "./loop-cli-json-command.js";
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
    return runLoopCliJsonCommand(
      this.runner,
      repoPath,
      projectName,
      ["src/cli.ts", "prompt", projectName, "--json"],
      parseProjectPromptReport,
      "prompt",
    );
  }
}
