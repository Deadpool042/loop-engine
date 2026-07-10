# Loop Engine

Orchestrateur local léger pour piloter les projets de développement sans IA automatique par défaut.

## Objectifs V0

- lister les projets locaux ;
- détecter leur état Git ;
- documenter les sources importantes ;
- préparer des contextes courts pour Claude, Codex ou GPT ;
- limiter la consommation de tokens ;
- garder les décisions humaines.

Loop Engine ne modifie pas les dépôts pilotés.

## Principes

- 0 IA automatique.
- 0 token consommé par défaut.
- Pas de commit automatique.
- Pas de push automatique.
- Les validations locales passent avant toute revue IA.
- Les projets pilotés restent indépendants.

## Commandes

- `pnpm loop summary` : affiche une vue compacte du workspace.
- `pnpm loop summary --json` : affiche la vue workspace en JSON pour scripts, OpenClaw, n8n ou dashboard.
- `pnpm loop status` : affiche l'état détaillé des projets configurés.
- `pnpm loop doctor` : vérifie la cohérence des chemins, docs et contraintes Git.
- `pnpm loop json-check` : vérifie que les sorties JSON publiques sont valides.
- `pnpm run rag-index` : reconstruit l'index RAG local dans `.loop-engine/`.
- `pnpm run rag-search -- <query>` : recherche dans l'index RAG local.
- `pnpm loop context creatyss` : prépare un contexte court pour reprendre un projet.
- `pnpm loop handoff creatyss` : prépare un contexte humain supervisé.
- `pnpm loop context creatyss --json` : affiche le contexte projet en JSON pour scripts, OpenClaw, n8n ou dashboard.
- `pnpm loop validate creatyss` : lance les validations configurées.
- `pnpm loop review creatyss` : prépare un contexte de revue basé sur Git sans appeler d'IA.
- `pnpm loop review creatyss --json` : prépare un contexte de revue Git en JSON pour scripts, OpenClaw, n8n ou dashboard.
- `pnpm loop next creatyss` : affiche la prochaine action sûre pour un projet.
- `pnpm loop next creatyss --json` : affiche la prochaine action sûre en JSON pour scripts, OpenClaw, n8n ou dashboard.
- `pnpm loop prompt creatyss` : génère un prompt court à coller dans un assistant IA.
- `pnpm loop prompt creatyss --json` : génère le contexte de prompt en JSON pour scripts, OpenClaw, n8n ou dashboard.

## Configuration

Les projets sont déclarés dans `projects.yaml`.

Champs optionnels :

- `optional: true`
- `requires_git: false`

## Philosophie

Automatiser le déterministe.  
Limiter l'IA au jugement.  
Garder l'humain sur les décisions.


### Lecture du summary

La commande `pnpm loop summary` affiche une vue compacte du workspace.

La partie roadmap utilise :

- `A` : candidats actifs ;
- `D` : candidats terminés ;
- `🟢` : aucun candidat bloqué ;
- `🔴` : au moins un candidat bloqué.

## Validation locale

- `pnpm run typecheck` : vérifie le typage TypeScript.
- `pnpm run test` : lance les tests unitaires Node.
- `pnpm run validate` : lance le typecheck, les tests et `json-check`.

## Auto-pilotage local

Loop Engine est déclaré dans `projects.yaml` comme projet `loop-engine`.

Cela permet d'utiliser la CLI sur elle-même :

- `pnpm loop summary`
- `pnpm loop context loop-engine`
- `pnpm loop validate loop-engine`
- `pnpm loop review loop-engine`

Cette boucle reste déterministe :

- aucun appel IA automatique ;
- aucune modification automatique ;
- aucune validation implicite hors des commandes configurées.


## Structure du projet

- `src/cli.ts` : routeur CLI minimal.
- `src/commands/` : commandes utilisateur et cas d'usage.
- `src/core/` : primitives bas niveau comme config, Git, docs et résolution projet.
- `src/intelligence/` : états calculés, ProjectSnapshot, roadmap et sélection de candidats.
- `src/ui/` : helpers d'affichage terminal.

Les commandes doivent consommer le `ProjectSnapshot` plutôt que relire directement Git, les docs ou la roadmap.

Voir aussi :

- `docs/architecture/commands.md`
- `docs/architecture/json-contracts.md`
- `docs/architecture/project-intelligence.md`
- `docs/architecture/roadmap-reader.md`
- `docs/architecture/memory-layer.md`
- `docs/architecture/memory-layer-checklist.md`
- `docs/architecture/local-rag-index.md`
- `docs/architecture/local-rag-sections.md`
- `docs/integrations/README.md`
- `docs/integrations/json-consumers.md`
- `docs/integrations/n8n-read-only.md`
- `docs/integrations/n8n-read-only-checklist.md`
- `docs/integrations/openclaw-read-only.md`
- `docs/integrations/openclaw-read-only-checklist.md`
- `docs/architecture/audit-engine.md`

## Audit et CI

Loop Engine expose un moteur d'audit intégré.

Commandes principales :

- `pnpm loop audit`
- `pnpm loop audit --json`
- `pnpm loop audit --strict`
- `pnpm loop audit --json --strict`
- `pnpm run audit:strict`
- `pnpm run ci`

Le rapport JSON expose notamment :

- `schemaVersion` ;
- `summary.status` ;
- `summary.score` ;
- `summary.byCategory` ;
- `summary.byPriority` ;
- `findings` ;
- `recommendations`.

Le script `pnpm run ci` exécute la validation générale puis l'audit strict. Il est utilisé par le workflow GitHub Actions du dépôt.

## Voir aussi

- [Audit Engine V3 — Rapport final](docs/audits/audit-engine-v3-final.md)
