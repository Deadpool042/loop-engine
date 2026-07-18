import { terminal } from "../ui/terminal.js";

export function printHelp(): void {
  terminal.header("Help");

  terminal.section("Workspace");
  terminal.info("pnpm loop summary         — vue compacte du workspace");
  terminal.info("pnpm loop summary --json  — vue workspace en JSON");
  terminal.info("pnpm loop status          — état détaillé des projets");
  terminal.info("pnpm loop json-check      — validate all public JSON outputs");
  terminal.info("pnpm run rag-index        — rebuild local RAG index");
  terminal.info("pnpm loop doctor          — vérification config/docs/git");

  terminal.section("Project");
  terminal.info(
    "pnpm loop context <project>        — contexte court de reprise",
  );
  terminal.info(
    "pnpm loop handoff <project>        — contexte humain supervisé",
  );
  terminal.info("pnpm loop context <project> --json — contexte projet en JSON");
  terminal.info(
    "pnpm loop validate <project>       — lance les validations configurées",
  );
  terminal.info(
    "pnpm loop review <project>         — prépare un contexte de revue Git",
  );
  terminal.info(
    "pnpm loop review <project> --json  — contexte de revue Git en JSON",
  );
  terminal.info("pnpm loop next <project>           — prochaine action sûre");
  terminal.info(
    "pnpm loop next <project> --json    — prochaine action en JSON",
  );
  terminal.info("pnpm loop prompt <project>         — prompt court à copier");
  terminal.info(
    "pnpm loop prompt <project> --json  — contexte de prompt en JSON",
  );

  terminal.section("Principes");
  terminal.info("Aucun appel IA automatique.");
  terminal.info("Aucun commit ou push automatique.");
  terminal.info("Les décisions restent humaines.");
}
