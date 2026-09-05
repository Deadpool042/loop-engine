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
  terminal.info("pnpm loop workspace status --json — état de matérialisation du portefeuille");
  terminal.info("pnpm loop workspace status <project> [--json] — état du workspace projet");
  terminal.info("pnpm loop workspace materialize <project> [--json] — clone/synchronise le repo déclaré");

  terminal.section("Project");
  terminal.info(
    "pnpm loop context <project>        — contexte court de reprise",
  );
  terminal.info(
    "pnpm loop handoff <project>        — contexte humain supervisé",
  );
  terminal.info(
    "pnpm loop project register <project> --type <type> --confirm-brief-approved [--json] — enregistre une enveloppe approuvée dans projects.yaml sur une branche dédiée",
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
  terminal.info(
    "pnpm loop roadmap overview <project> [--json] — projection bornée des lots et clés de détail",
  );
  terminal.info(
    "pnpm loop roadmap detail <project> --candidate-key <key> [--json] — détail borné d’un lot canonique",
  );
  terminal.info(
    "pnpm loop roadmap objective <project> — source canonique d’objectif",
  );
  terminal.info(
    "pnpm loop roadmap objective <project> --json — objectif canonique en JSON",
  );
  terminal.info(
    "pnpm loop roadmap proposal-context <project> — contexte déterministe de proposition",
  );
  terminal.info(
    "pnpm loop roadmap proposal-context <project> --json — contexte de proposition en JSON",
  );
  terminal.info(
    "pnpm loop roadmap decision <project> [--json] — décision gouvernée : existing_candidate | proposal | no_proposal | unavailable",
  );
  terminal.info(
    "pnpm loop roadmap decision <project> --request-proposal --provider anthropic_api [--json] — autorise l'unique appel provider borné nécessaire pour trancher proposal/no_proposal",
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
  terminal.info(
    "Fallback explicite execute/publish: --fallback-provider <codex|claude_code> --fallback-provider-executable <path>",
  );
  terminal.info(
    "Options fallback: --fallback-provider-model <model> --fallback-provider-timeout-ms <ms>",
  );
  terminal.info(
    "pnpm loop runs <project>           — historique des runs terminés (le plus récent d'abord)",
  );
  terminal.info(
    "pnpm loop runs <project> --json [--limit N] — historique des runs en JSON, lecture bornée",
  );
  terminal.info(
    "pnpm loop runs <project> --models [--json] [--limit N] — comparaison read-only des modèles depuis le même Run History",
  );
  terminal.info(
    "pnpm loop runs <project> --run-id <id> [--json] — ouvre un run exact hors fenêtre récente",
  );
  terminal.info(
    "pnpm loop candidate review <project> --run-id <id> [--json] — relit une candidate V33 depuis Git",
  );

  terminal.section("Principes");
  terminal.info(
    "Aucun appel IA implicite : execute et le provider sont explicites.",
  );
  terminal.info("Aucun commit ou push automatique en mode execute.");
  terminal.info("Les validations configurées passent après l'agent.");
}
