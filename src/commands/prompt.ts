import {
  generateProjectPromptReport,
  generateProjectReport,
  type ProjectConfig,
} from "../core/index.js";
import { terminal } from "../ui/terminal.js";

export function printProjectPrompt(project: ProjectConfig): void {
  const snapshot = generateProjectReport(project);

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

    const selectedCandidate = snapshot.roadmap.selectedCandidate;

    console.log("");
    console.log("## Candidat roadmap");
    if (!selectedCandidate) {
      console.log("- Aucun candidat détecté.");
    } else {
      console.log(`- Kind : ${selectedCandidate.kind}`);
      console.log(`- Status : ${selectedCandidate.status}`);
      console.log(`- Priority : ${selectedCandidate.priority}`);
      console.log(`- Reason : ${selectedCandidate.reason}`);
      console.log(
        `- Location : ${selectedCandidate.path}:${selectedCandidate.line}`,
      );
      console.log(`- Text : ${selectedCandidate.text}`);

      if (selectedCandidate.kind === "blocked") {
        console.log("- Attention : ne pas démarrer ce candidat directement.");
        console.log(
          "- Action recommandée : choisir un prérequis plus petit et réversible.",
        );
      } else if (selectedCandidate.kind === "warning") {
        console.log(
          "- Attention : candidat sensible, à cadrer avant implémentation.",
        );
      }
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
  console.log(
    "- Lire les sources listées avant toute intervention significative.",
  );
  console.log("- Respecter l'architecture et les conventions du projet.");
  console.log("- Travailler par micro-lots sûrs et réversibles.");
  console.log(
    "- Ne pas modifier de fichiers hors périmètre sans justification explicite.",
  );
  console.log("- Ne pas ajouter de dépendance inutile.");
  console.log("- Lancer les validations configurées avant review ou commit.");
}

export function printProjectPromptJson(project: ProjectConfig): void {
  console.log(JSON.stringify(generateProjectPromptReport(project)));
}
