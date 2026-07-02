import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";
import { docExists } from "../core/docs.js";
import { getGitBranch, getGitState } from "../core/git.js";
import { terminal } from "../ui/terminal.js";

export function printProjectContext(project: ProjectConfig): void {
  const projectPath = resolve(project.path);
  const branch = getGitBranch(projectPath);
  const state = getGitState(projectPath);

  terminal.header(`Context • ${project.name}`);
  terminal.info(`Project: ${project.name}`);
  terminal.info(`Type: ${project.type}`);
  terminal.info(`Path: ${projectPath}`);

  if (state === "clean") {
    terminal.success(`Git: ${branch} / clean`);
  } else {
    terminal.warning(`Git: ${branch} / dirty`);
  }

  terminal.section("Sources à lire");
  for (const doc of project.required_docs) {
    const exists = docExists(projectPath, doc);

    if (exists) {
      terminal.success(doc);
    } else {
      terminal.error(`${doc} missing`);
    }
  }

  terminal.section("Validation");
  if (project.validation.length === 0) {
    terminal.warning("Aucune commande configurée.");
  } else {
    for (const command of project.validation) {
      terminal.success(command);
    }
  }

  terminal.section("Règles");
  terminal.info("Ne pas modifier le projet sans demande explicite.");
  terminal.info("Ne pas lancer d'IA automatiquement.");
  terminal.info("Préférer les micro-lots sûrs et réversibles.");
  terminal.info("Lancer les validations avant review ou commit.");
}
