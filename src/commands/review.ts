import {
  generateProjectReport,
  generateReviewReport,
  type ProjectConfig,
} from "../core/index.js";
import { terminal } from "../ui/terminal.js";

function printBlock(title: string, content: string): void {
  terminal.section(title);

  if (content.trim().length === 0) {
    terminal.info("Empty.");
    return;
  }

  console.log(content);
}

export function printReviewContext(project: ProjectConfig): void {
  const snapshot = generateProjectReport(project);
  const report = generateReviewReport(project);

  terminal.header(`Review • ${snapshot.project.name}`);
  terminal.info(`Project: ${snapshot.project.name}`);
  terminal.info(`Path: ${snapshot.project.path}`);

  if (!snapshot.git.requiresGit) {
    terminal.warning("Git repository not required.");
  } else {
    printBlock("Git status", report.gitStatus);
    printBlock("Diff stat", report.diffStat);
    printBlock("Diff", report.diff);
  }

  terminal.section("Validation");
  if (!snapshot.validation.configured) {
    terminal.warning("No validation command configured.");
  } else {
    for (const command of snapshot.validation.commands) {
      terminal.success(command);
    }
  }

  terminal.section("Review rules");
  terminal.info("Check architecture boundaries.");
  terminal.info("Check TypeScript strictness.");
  terminal.info("Check absence of unnecessary dependencies.");
  terminal.info("Check validation commands before commit.");
  terminal.info("Prefer small, reversible changes.");
}

export function printReviewContextJson(project: ProjectConfig): void {
  const { diff, ...report } = generateReviewReport(project);
  void diff;
  console.log(JSON.stringify(report));
}
