
import { printProjectContext, printProjectContextJson } from "./commands/context.js";
import { printProjectHandoff, printProjectHandoffJson } from "./commands/handoff.js";
import { validateProject } from "./commands/validate.js";
import { printReviewContext, printReviewContextJson } from "./commands/review.js";
import { printWorkspaceSummary, printWorkspaceSummaryJson } from "./commands/summary.js";
import { printHelp } from "./commands/help.js";
import { runJsonCheck } from "./commands/json-check.js";
import { runRagIndex } from "./commands/rag-index.js";
import { runRagSearch } from "./commands/rag-search.js";
import { printNextProjectAction, printNextProjectActionJson } from "./commands/next.js";
import { printProjectPrompt, printProjectPromptJson } from "./commands/prompt.js";
import { printStatus } from "./commands/status.js";
import { printDoctor } from "./commands/doctor.js";
import { printAuditReport, printAuditReportJson } from "./commands/audit.js";
import { loadConfig } from "./core/config.js";
import { findProject, getRequiredProjectName } from "./core/project.js";
import { terminal } from "./ui/terminal.js";
import { printJsonError } from "./commands/json-error.js";



function resolveProjectOrExit(commandName: string) {
  const config = loadConfig();

  if (!process.argv[3] || process.argv[3].startsWith("--")) {
    if (process.argv.includes("--json")) {
      printJsonError("missing_project", `Missing project argument for ${commandName}`);
    } else {
      terminal.error(`Missing project argument for ${commandName}`);
    }
    process.exit(1);
  }

  const projectName = getRequiredProjectName(process.argv, commandName);
  const project = findProject(config, projectName);

  if (!project) {
    if (process.argv.includes("--json")) {
      printJsonError("unknown_project", `Unknown project: ${projectName}`);
    } else {
      terminal.error(`Unknown project: ${projectName}`);
    }
    process.exit(1);
  }

  return project;
}

const command = process.argv[2] ?? "help";

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
} else if (command === "summary" && process.argv.includes("--json")) {
  printWorkspaceSummaryJson(loadConfig());
} else if (command === "status") {
  printStatus(loadConfig());
} else if (command === "summary") {
  printWorkspaceSummary(loadConfig());
} else if (command === "json-check") {
  runJsonCheck();
} else if (command === "rag-index") {
  runRagIndex();
} else if (command === "rag-search") {
  const json = process.argv.includes("--json");
  const limitIndex = process.argv.indexOf("--limit");
  const limit =
    limitIndex >= 0 ? Number.parseInt(process.argv[limitIndex + 1] ?? "", 10) : undefined;
  const pathIndex = process.argv.indexOf("--path");
  const pathPrefix = pathIndex >= 0 ? process.argv[pathIndex + 1] : undefined;

  const query = process.argv
    .slice(3)
    .filter((argument, index, argumentsList) => {
      if (
        argument === "--" ||
        argument === "--json" ||
        argument === "--limit" ||
        argument === "--path"
      ) {
        return false;
      }

      return argumentsList[index - 1] !== "--limit" && argumentsList[index - 1] !== "--path";
    })
    .join(" ");

  runRagSearch(query, {
    ...(json ? { json } : {}),
    ...(limit === undefined ? {} : { limit }),
    ...(pathPrefix === undefined ? {} : { pathPrefix }),
  });
} else if (command === "doctor") {
  printDoctor(loadConfig());
} else if (command === "audit") {
  const strict = process.argv.includes("--strict");
  const report = process.argv.includes("--json")
    ? printAuditReportJson()
    : printAuditReport();

  if (strict && report.summary.status !== "pass") {
    process.exitCode = 1;
  }
} else if (command === "handoff") {
  const project = resolveProjectOrExit("handoff");

  if (process.argv.includes("--json")) {
    printProjectHandoffJson(project);
  } else {
    printProjectHandoff(project);
  }
} else if (command === "context") {
  const project = resolveProjectOrExit("context");

  if (process.argv.includes("--json")) {
    printProjectContextJson(project);
  } else {
    printProjectContext(project);
  }
} else if (command === "validate") {
  const project = resolveProjectOrExit("validate");

  await validateProject(project);
} else if (command === "review") {
  const project = resolveProjectOrExit("review");

  if (process.argv.includes("--json")) {
    printReviewContextJson(project);
  } else {
    printReviewContext(project);
  }
} else if (command === "next") {
  const project = resolveProjectOrExit("next");

  if (process.argv.includes("--json")) {
    printNextProjectActionJson(project);
  } else {
    printNextProjectAction(project);
  }
} else if (command === "prompt") {
  const project = resolveProjectOrExit("prompt");

  if (process.argv.includes("--json")) {
    printProjectPromptJson(project);
  } else {
    printProjectPrompt(project);
  }
} else {
  terminal.error("Usage: pnpm loop help|summary|status|doctor|context <project>|validate <project>|review <project>|next <project>|prompt <project>");
  process.exit(1);
}
