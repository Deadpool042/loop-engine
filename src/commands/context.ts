import { type ProjectConfig } from "../core/config.js";
import { buildProjectSnapshot } from "../intelligence/project-snapshot.js";
import { terminal } from "../ui/terminal.js";

export function printProjectContext(project: ProjectConfig): void {
  const snapshot = buildProjectSnapshot(project);

  terminal.header(`Context • ${snapshot.project.name}`);
  terminal.info(`Project: ${snapshot.project.name}`);
  terminal.info(`Type: ${snapshot.project.type}`);
  terminal.info(`Path: ${snapshot.project.path}`);

  if (!snapshot.git.requiresGit) {
    terminal.warning("Git: not required");
  } else if (snapshot.git.clean) {
    terminal.success(`Git: ${snapshot.git.branch} / clean`);
  } else {
    terminal.warning(`Git: ${snapshot.git.branch} / dirty`);
  }

  terminal.section("Sources à lire");
  for (const doc of snapshot.docs.required) {
    if (snapshot.docs.missing.includes(doc)) {
      terminal.error(`${doc} missing`);
    } else {
      terminal.success(doc);
    }
  }

  terminal.section("Validation");
  if (!snapshot.validation.configured) {
    terminal.warning("Aucune commande configurée.");
  } else {
    for (const command of snapshot.validation.commands) {
      terminal.success(command);
    }
  }

  terminal.section("Règles");
  terminal.info("Ne pas modifier le projet sans demande explicite.");
  terminal.info("Ne pas lancer d'IA automatiquement.");
  terminal.info("Préférer les micro-lots sûrs et réversibles.");
  terminal.info("Lancer les validations avant review ou commit.");
}
