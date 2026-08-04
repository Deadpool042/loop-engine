import { runLoopCliJsonCommand } from "./loop-cli-json-command.js";
import type { ProcessRunner } from "./process-runner.js";

export interface LoopCliValidateClient {
  validateProject(repoPath: string, projectName: string): Promise<void>;
}

export class DefaultLoopCliValidateClient implements LoopCliValidateClient {
  constructor(private readonly runner: ProcessRunner) {}

  async validateProject(repoPath: string, projectName: string): Promise<void> {
    await runLoopCliJsonCommand(
      this.runner,
      repoPath,
      projectName,
      ["src/cli.ts", "validate", projectName],
      () => undefined,
      "validate",
    );
  }
}
