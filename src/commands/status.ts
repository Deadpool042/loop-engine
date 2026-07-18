import { generateWorkspaceReports, type Config } from "../core/index.js";
import { terminal } from "../ui/terminal.js";

export function printStatus(config: Config): void {
  terminal.header("Status");

  for (const [index, snapshot] of generateWorkspaceReports(config).entries()) {
    const project = config.projects[index]!;

    terminal.section(snapshot.project.name);
    terminal.info(`Path: ${snapshot.project.path}`);
    terminal.info(`Type: ${snapshot.project.type}`);

    if (!snapshot.git.requiresGit) {
      terminal.warning("Git: not required");
    } else if (snapshot.git.clean) {
      terminal.success(`Git: ${snapshot.git.branch} / clean`);
    } else {
      terminal.warning(`Git: ${snapshot.git.branch} / dirty`);
    }

    terminal.info("Docs:");
    for (const doc of snapshot.docs.required) {
      if (snapshot.docs.missing.includes(doc)) {
        if (project.optional === true) {
          terminal.warning(`${doc} missing`);
        } else {
          terminal.error(`${doc} missing`);
        }
      } else {
        terminal.success(doc);
      }
    }

    terminal.info("Validation:");
    if (!snapshot.validation.configured) {
      terminal.warning("No validation command configured");
    } else {
      for (const command of snapshot.validation.commands) {
        terminal.success(command);
      }
    }
  }
}
