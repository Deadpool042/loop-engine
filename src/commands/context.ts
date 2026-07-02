import { resolve } from "node:path";

import { type ProjectConfig } from "../core/config.js";
import { docExists } from "../core/docs.js";
import { getGitBranch, getGitState } from "../core/git.js";

export function printProjectContext(project: ProjectConfig): void {
  const projectPath = resolve(project.path);
  const branch = getGitBranch(projectPath);
  const state = getGitState(projectPath);

  console.log(`# Loop Context — ${project.name}`);
  console.log("");
  console.log(`Project: ${project.name}`);
  console.log(`Type: ${project.type}`);
  console.log(`Path: ${projectPath}`);
  console.log(`Git: ${branch} / ${state}`);
  console.log("");

  console.log("## Sources à lire");
  for (const doc of project.required_docs) {
    const exists = docExists(projectPath, doc);
    console.log(`- ${exists ? "OK" : "MISSING"} ${doc}`);
  }
  console.log("");

  console.log("## Validation");
  if (project.validation.length === 0) {
    console.log("- Aucune commande configurée.");
  } else {
    for (const command of project.validation) {
      console.log(`- ${command}`);
    }
  }
  console.log("");

  console.log("## Règles");
  console.log("- Ne pas modifier le projet sans demande explicite.");
  console.log("- Ne pas lancer d'IA automatiquement.");
  console.log("- Préférer les micro-lots sûrs et réversibles.");
  console.log("- Lancer les validations avant review ou commit.");
}
