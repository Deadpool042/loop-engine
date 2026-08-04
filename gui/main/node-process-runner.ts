import { spawn } from "node:child_process";

import type {
  SummaryProcessRequest,
  SummaryProcessResult,
  SummaryProcessRunner,
} from "./cli-summary-client.js";

export class NodeProcessRunner implements SummaryProcessRunner {
  async run(
    request: SummaryProcessRequest,
  ): Promise<SummaryProcessResult> {
    return await new Promise((resolve, reject) => {
      const child = spawn(request.executable, request.args, {
        cwd: request.cwd,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");

      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      child.on("error", reject);

      child.on("close", (code) => {
        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
        });
      });
    });
  }
}
