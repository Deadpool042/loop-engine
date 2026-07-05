# OpenClaw Read-only Integration

## Objectif

Permettre à OpenClaw de consommer Loop Engine sans déclencher d'action autonome.

OpenClaw doit aider à préparer une session humaine, pas piloter le dépôt seul.

## Commandes autorisées

- `pnpm exec tsx src/cli.ts summary --json`
- `pnpm exec tsx src/cli.ts context <project> --json`
- `pnpm exec tsx src/cli.ts next <project> --json`
- `pnpm exec tsx src/cli.ts prompt <project> --json`
- `pnpm exec tsx src/cli.ts review <project> --json`

## Usage recommandé

1. Lire `summary --json`.
2. Laisser l'utilisateur choisir un projet.
3. Lire `next <project> --json`.
4. Lire `prompt <project> --json`.
5. Afficher le contexte à l'utilisateur.
6. Attendre confirmation humaine avant toute action.

## Garde-fous

- Aucun appel IA automatique.
- Aucun commit automatique.
- Aucun push automatique.
- Aucune modification automatique.
- Aucun déploiement automatique.
- Les décisions restent humaines.

## Données utiles

OpenClaw peut utiliser :

- `project`
- `git`
- `roadmap.selectedCandidate`
- `roadmap.summary`
- `roadmap.stats`
- `validation`
- `health`

## Limites V1.7

Cette intégration ne fournit pas encore :

- connecteur OpenClaw réel ;
- workflow automatisé ;
- mémoire projet ;
- exécution d'actions ;
- système d'approbation avancé.
