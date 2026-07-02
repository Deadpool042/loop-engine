import { terminal } from "../ui/terminal.js";

export function printHelp(): void {
  terminal.header("Help");

  terminal.section("Workspace");
  terminal.info("pnpm loop summary  — vue compacte du workspace");
  terminal.info("pnpm loop status   — état détaillé des projets");
  terminal.info("pnpm loop doctor   — vérification config/docs/git");

  terminal.section("Project");
  terminal.info("pnpm loop context <project>   — contexte court de reprise");
  terminal.info("pnpm loop validate <project>  — lance les validations configurées");
  terminal.info("pnpm loop review <project>    — prépare un contexte de revue Git");

  terminal.section("Principes");
  terminal.info("Aucun appel IA automatique.");
  terminal.info("Aucun commit ou push automatique.");
  terminal.info("Les décisions restent humaines.");
}
