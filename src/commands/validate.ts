import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";

function formatDuration(startedAt: number): string {
  const elapsedMs = Date.now() - startedAt;
  const seconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function startSpinner(label: string, startedAt: number): NodeJS.Timeout {
  const frames = ["-", "\\", "|", "/"];
  let index = 0;

  return setInterval(() => {
    const frame = frames[index % frames.length];
    index += 1;
    process.stdout.write(`\r${frame} ${label} (${formatDuration(startedAt)})`);
  }, 150);
}

function stopSpinner(timer: NodeJS.Timeout): void {
  clearInterval(timer);
  process.stdout.write("\r\x1b[K");
}

function runValidationCommand(command: string, cwd: string): number {
  const startedAt = Date.now();
  const timer = startSpinner(`Running ${command}`, startedAt);

  const child = spawn(command, {
    cwd,
    shell: true,
    stdio: ["ignore", "ignore", "ignore"],
  });

  return new Promise<number>((resolvePromise) => {
    child.on("close", (code) => {
      stopSpinner(timer);
      console.log(`- ${code === 0 ? "OK" : "FAILED"} ${command} (${formatDuration(startedAt)})`);
      resolvePromise(code ?? 1);
    });
  }) as unknown as number;
}

export async function validateProject(project: ProjectConfig): Promise<void> {
  const projectPath = resolve(project.path);

  if (project.validation.length === 0) {
    console.log(`No validation command configured for ${project.name}.`);
    return;
  }

  console.log(`Validation for ${project.name}`);

  for (const command of project.validation) {
    const code = await runValidationCommand(command, projectPath);

    if (code !== 0) {
      console.error(`\nValidation failed: ${command}`);
      process.exit(code);
    }
  }

  console.log(`Validation passed for ${project.name}.`);
}
