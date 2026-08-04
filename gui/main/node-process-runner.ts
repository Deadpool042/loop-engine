import { spawn } from "node:child_process";

import type {
  ProcessRequest,
  ProcessResult,
  ProcessRunner,
} from "./process-runner.js";

export class NodeProcessRunner implements ProcessRunner {
  async run(request: ProcessRequest): Promise<ProcessResult> {
    return await new Promise((resolve, reject) => {
      const child = spawn(request.executable, request.args, {
        cwd: request.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });

      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });

      child.once("error", reject);

      child.once("close", (code) => {
        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
        });
      });
    });
  }
}
