import { type ProjectConfig } from "../core/config.js";
import { buildProjectSnapshot } from "../intelligence/project-snapshot.js";
import { terminal } from "../ui/terminal.js";

export function printProjectPrompt(project: ProjectConfig): void {
  const snapshot = buildProjectSnapshot(project);

  terminal.header(`Prompt • ${snapshot.project.name}`);

  console.log(`Tu travailles sur le projet ${snapshot.project.name}.`);
  console.log("");
  console.log("## Contexte projet");
  console.log(`- Nom : ${snapshot.project.name}`);
  console.log(`- Type : ${snapshot.project.type}`);
  console.log(`- Chemin local : ${snapshot.project.path}`);

  console.log("");
  console.log("## Git");
  if (!snapshot.git.requiresGit) {
    console.log("- Git : non requis");
  } else {
    console.log(`- Branche : ${snapshot.git.branch}`);
    console.log(`- Working tree : ${snapshot.git.clean ? "clean" : "dirty"}`);

    if (snapshot.git.lastCommit) {
      console.log(
        `- Dernier commit : ${snapshot.git.lastCommit.hash.slice(0, 8)} ${snapshot.git.lastCommit.message}`,
      );
    }
  }

  console.log("");
  console.log("## Documentation à lire");
  for (const doc of snapshot.docs.required) {
    const status = snapshot.docs.missing.includes(doc) ? "MANQUANT" : "OK";
    console.log(`- ${status} ${doc}`);
  }

  console.log("");
  console.log("## Roadmap");
  if (!snapshot.roadmap.available) {
    console.log("- Aucune roadmap configurée.");
  } else {
    for (const roadmapPath of snapshot.roadmap.paths) {
      console.log(`- ${roadmapPath}`);
    }
  }

  console.log("");
  console.log("## Validation");
  if (!snapshot.validation.configured) {
    console.log("- Aucune commande de validation configurée.");
  } else {
    for (const command of snapshot.validation.commands) {
      console.log(`- ${command}`);
    }
  }

  console.log("");
  console.log("## Consignes");
  console.log("- Lire les sources listées avant toute intervention significative.");
  console.log("- Respecter l'architecture et les conventions du projet.");
  console.log("- Travailler par micro-lots sûrs et réversibles.");
  console.log("- Ne pas modifier de fichiers hors périmètre sans justification explicite.");
  console.log("- Ne pas ajouter de dépendance inutile.");
  console.log("- Lancer les validations configurées avant review ou commit.");
}
