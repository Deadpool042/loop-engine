
import { printProjectContext } from "./commands/context.js";
import { validateProject } from "./commands/validate.js";
import { printReviewContext } from "./commands/review.js";
import { printWorkspaceSummary, printWorkspaceSummaryJson } from "./commands/summary.js";
import { printHelp } from "./commands/help.js";
import { printNextProjectAction } from "./commands/next.js";
import { printProjectPrompt } from "./commands/prompt.js";
import { printStatus } from "./commands/status.js";
import { printDoctor } from "./commands/doctor.js";
import { loadConfig } from "./core/config.js";
import { findProject, getRequiredProjectName } from "./core/project.js";
import { terminal } from "./ui/terminal.js";


const command = process.argv[2] ?? "help";

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
} else if (command === "summary" && process.argv.includes("--json")) {
  printWorkspaceSummaryJson(loadConfig());
} else if (command === "status") {
  printStatus(loadConfig());
} else if (command === "summary") {
  printWorkspaceSummary(loadConfig());
} else if (command === "doctor") {
  printDoctor(loadConfig());
} else if (command === "context") {
  const config = loadConfig();
  const projectName = getRequiredProjectName(process.argv, "context");
  const project = findProject(config, projectName);

  if (!project) {
    terminal.error(`Unknown project: ${projectName}`);
    process.exit(1);
  }

  printProjectContext(project);
} else if (command === "validate") {
  const config = loadConfig();
  const projectName = getRequiredProjectName(process.argv, "validate");
  const project = findProject(config, projectName);

  if (!project) {
    terminal.error(`Unknown project: ${projectName}`);
    process.exit(1);
  }

  await validateProject(project);
} else if (command === "review") {
  const config = loadConfig();
  const projectName = getRequiredProjectName(process.argv, "review");
  const project = findProject(config, projectName);

  if (!project) {
    terminal.error(`Unknown project: ${projectName}`);
    process.exit(1);
  }

  printReviewContext(project);
} else if (command === "next") {
  const config = loadConfig();
  const projectName = getRequiredProjectName(process.argv, "next");
  const project = findProject(config, projectName);

  if (!project) {
    terminal.error(`Unknown project: ${projectName}`);
    process.exit(1);
  }

  printNextProjectAction(project);
} else if (command === "prompt") {
  const config = loadConfig();
  const projectName = getRequiredProjectName(process.argv, "prompt");
  const project = findProject(config, projectName);

  if (!project) {
    terminal.error(`Unknown project: ${projectName}`);
    process.exit(1);
  }

  printProjectPrompt(project);
} else {
  terminal.error("Usage: pnpm loop help|summary|status|doctor|context <project>|validate <project>|review <project>|next <project>|prompt <project>");
  process.exit(1);
}
