import { terminal } from "../ui/terminal.js";

export function printHelp(): void {
  terminal.header("Help");

  terminal.section("Workspace");
  terminal.info("pnpm loop summary         — vue compacte du workspace");
  terminal.info("pnpm loop summary --json  — vue workspace en JSON");
  terminal.info("pnpm loop serve-summary   — bridge HTTP read-only de summary");
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
  terminal.info(
    "pnpm loop roadmap status <project> — état de planning déterministe",
  );
  terminal.info(
    "pnpm loop roadmap status <project> --json — état de planning en JSON",
  );
  terminal.info("pnpm loop prompt <project>         — prompt court à copier");
  terminal.info(
    "pnpm loop prompt <project> --json  — contexte de prompt en JSON",
  );

  terminal.section("Loop execution");
  terminal.info(
    "pnpm loop run <project> --mode plan — prépare un cycle sans appeler d'agent",
  );
  terminal.info(
    "--candidate <id> fixe un lot de roadmap structuré pour plan ou execute",
  );
  terminal.info(
    "pnpm loop run <project> --mode execute --provider claude_code --provider-executable claude",
  );
  terminal.info(
    "pnpm loop run <project> --mode execute --provider codex --provider-executable codex",
  );
  terminal.info(
    "--export-patch <path> exports a validated isolated Git patch without applying it",
  );
  terminal.info(
    "Options provider: --provider-model <model> --provider-timeout-ms <ms>",
  );

  terminal.section("Principes");
  terminal.info("Aucun appel IA implicite : execute et le provider sont explicites.");
  terminal.info("Aucun commit ou push automatique en mode execute.");
  terminal.info("Les validations configurées passent après l'agent.");
}
