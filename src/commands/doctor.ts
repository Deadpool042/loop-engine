import { generateDoctorReport, type Config } from "../core/index.js";
import { terminal } from "../ui/terminal.js";

export function printDoctor(config: Config): void {
  const report = generateDoctorReport(config);

  terminal.header("Doctor");

  for (const entry of report.projects) {
    const {
      project,
      path: projectPath,
      exists: projectExists,
      isGitRepository: gitDirExists,
      missingRequiredDocs,
    } = entry;

    terminal.section(project.name);
    terminal.info(`Path: ${projectPath}`);

    if (!projectExists) {
      terminal.error("Project path does not exist");
      continue;
    }

    if (project.requires_git === false) {
      terminal.warning("Git repository not required");
    } else if (!gitDirExists) {
      terminal.error("Project is not a Git repository");
    } else {
      terminal.success("Git repository detected");
    }

    for (const doc of project.required_docs) {
      const exists = !missingRequiredDocs.includes(doc);
      if (!exists) {
        if (project.optional === true) {
          terminal.warning(`${doc} missing`);
        } else {
          terminal.error(`${doc} missing`);
        }
      } else {
        terminal.success(`${doc}`);
      }
    }

    if (project.validation.length === 0) {
      terminal.warning("No validation command configured");
    } else {
      terminal.success(
        `${project.validation.length} validation command(s) configured`,
      );
    }
  }

  if (report.hasError) {
    process.exitCode = 1;
  }
}
