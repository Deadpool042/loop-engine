import { spawn } from "node:child_process";
import {
  generateProjectValidationReport,
  runConfiguredValidations,
  type ProjectConfig,
} from "../core/index.js";
import { terminal } from "../ui/terminal.js";

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
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let index = 0;

  return setInterval(() => {
    const frame = frames[index % frames.length];
    index += 1;
    terminal.writeInline(`${frame} ${label} (${formatDuration(startedAt)})`);
  }, 120);
}

function stopSpinner(timer: NodeJS.Timeout): void {
  clearInterval(timer);
  terminal.clearLine();
}

function runValidationCommand(command: string, cwd: string): Promise<number> {
  const startedAt = Date.now();

  terminal.step(command);
  const timer = startSpinner("Running", startedAt);

  const child = spawn(command, {
    cwd,
    shell: true,
    stdio: ["ignore", "ignore", "ignore"],
  });

  return new Promise<number>((resolvePromise) => {
    child.on("close", (code) => {
      stopSpinner(timer);

      if (code === 0) {
        terminal.success(`${command} (${formatDuration(startedAt)})`);
      } else {
        terminal.error(`${command} (${formatDuration(startedAt)})`);
      }

      resolvePromise(code ?? 1);
    });
  });
}

export async function validateProject(project: ProjectConfig): Promise<void> {
  const startedAt = Date.now();
  const report = generateProjectValidationReport(project);

  terminal.header("Validate");
  terminal.info(`Project: ${project.name}`);
  terminal.info(`Path: ${report.projectPath}`);

  if (project.validation.length === 0) {
    terminal.warning(`No validation command configured for ${project.name}.`);
    return;
  }

  terminal.section("Validation");

  const result = await runConfiguredValidations(project, runValidationCommand);
  if (result.failedCommand) {
    terminal.error(`Validation failed: ${result.failedCommand}`);
    process.exit(result.exitCode);
  }

  terminal.section("Result");
  terminal.success(
    `Validation passed for ${project.name} (${formatDuration(startedAt)}).`,
  );
}
