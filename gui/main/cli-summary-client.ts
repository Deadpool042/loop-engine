import { join } from "node:path";

import {
  parseWorkspaceSummary,
  type WorkspaceSummary,
} from "../shared/workspace-summary.js";

export type SummaryProcessRequest = Readonly<{
  executable: string;
  args: readonly string[];
  cwd: string;
}>;

export type SummaryProcessResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export interface SummaryProcessRunner {
  run(request: SummaryProcessRequest): Promise<SummaryProcessResult>;
}

export interface LoopCliSummaryClient {
  loadWorkspaceSummary(repoPath: string): Promise<WorkspaceSummary>;
}

export class DefaultLoopCliSummaryClient implements LoopCliSummaryClient {
  constructor(private readonly runner: SummaryProcessRunner) {}

  async loadWorkspaceSummary(repoPath: string): Promise<WorkspaceSummary> {
    if (typeof repoPath !== "string" || repoPath.trim().length === 0) {
      throw new TypeError("repoPath must be a non-empty string");
    }

    const executable = join(
      repoPath,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tsx.cmd" : "tsx",
    );

    const result = await this.runner.run({
      executable,
      args: ["src/cli.ts", "summary", "--json"],
      cwd: repoPath,
    });

    if (result.exitCode !== 0) {
      throw new Error(
        result.stderr.trim() ||
          `Loop CLI summary failed with exit code ${result.exitCode}`,
      );
    }

    return parseWorkspaceSummary(result.stdout.trim());
  }
}
