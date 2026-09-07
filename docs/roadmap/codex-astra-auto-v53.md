# V53 — Codex Astra et résilience AUTO

## Objectif

Mettre à niveau le portefeuille AUTO abonnement sans ajouter de fournisseur API payant, et corriger deux défauts observés en burn-in réel : le worktree partagé entre providers lors d’un fallback et le budget de réparation non exécutable lorsqu’aucun `LoopRepairer` n’est configuré.

## Faits vérifiés

- VPS : `codex-cli 0.153.4`.
- Authentification : abonnement ChatGPT existant ; aucune clé API nécessaire au probe.
- Probe réel : `codex exec --model gpt-6-astra` a terminé avec succès dans un répertoire temporaire et a renvoyé la sentinelle attendue.
- Le portefeuille AUTO actuel contient :
  - Codex economy : `gpt-5.6-luna` ;
  - Codex standard : `gpt-5.6-sol` ;
  - Codex advanced : `gpt-5.6-terra`.
- Le failover provider actuel exécute plusieurs providers dans le même cwd sans reset intermédiaire.
- Codex refuse volontairement un worktree non propre via `worktree_not_clean`.
- Le runner peut recevoir `maxRepairs > 0` alors que `repairer === null`, ce qui produit `repairer_unavailable`.

## Décisions

### V53.0 — Astra

- Remplacer uniquement `gpt-5.6-terra` par `gpt-6-astra` dans le profil Codex `advanced`.
- Ne pas rendre Astra modèle par défaut pour les tâches simples.
- Conserver Claude primaire à rang économique équivalent selon la politique existante.
- Aucun provider API payant ni crédit additionnel implicite.

### V53.1 — reset inter-provider

- Un fallback provider ne peut commencer qu’après restauration du worktree au baseline capturé avant la première tentative.
- Le reset doit être mécanique et borné : `git reset --hard <baseline>` puis `git clean -fd --`.
- Le callback de reset est injecté explicitement dans le failover ; sans callback, un fallback récupérable est bloqué au lieu de réutiliser un delta non validé.
- Après reset réussi, l’agrégat `modifiedFiles` est vidé avant la tentative suivante.
- Le résultat final ne doit contenir que le delta du provider terminal.

### V53.2 — budget de réparation honnête

- Si aucun `LoopRepairer` n’est fourni, `effectiveMaxRepairs = 0`.
- Le runner n’entre jamais dans l’état `repairing` sans repairer concret.
- Sur validation échouée, le chemin existant d’escalade de modèle peut toujours s’exécuter ; sinon l’exécution termine en `validation_failed`.
- Aucun adapter de réparation fictif n’est ajouté dans V53.

## Preuves

- Codex CLI VPS : `0.153.4`.
- Probe abonnement réel : `gpt-6-astra` invoqué avec succès sans clé API.
- Tests V53 ciblés : 31/31 verts.
- `pnpm run typecheck` : vert.
- `pnpm run json-check` : vert.
- `pnpm run audit:strict` : vert.
- `pnpm run audit:profiles` : vert.
- `pnpm run validate` complet dépasse la fenêtre du connecteur Development Workspace ; la CI GitHub reste le gate complet avant merge.

## Quotas et usage OpenClaw

Aucun nouveau composant n’est nécessaire. Le Cockpit OpenClaw consomme déjà le RPC natif `usage.status`, normalise les providers OpenAI/Codex et Anthropic/Claude et affiche leurs fenêtres de quota dans l’onglet Activité.

Vérification runtime du 2026-09-07 :

- Codex : fenêtres 5 h + semaine présentes ;
- Claude : fenêtres 5 h + semaine présentes ;
- le rendu calcule le pourcentage restant et la date de reset ;
- aucune source Codex parallèle n’est ajoutée ;
- les tokens/coûts par run restent « non disponibles » tant qu’une source provider fiable ne les expose pas.

Cette décision évite un second système de suivi et conserve OpenClaw comme simple projection des sources provider déjà disponibles.

## Critères de clôture



1. Les tests AUTO attendent `gpt-6-astra` comme profil Codex advanced — **validé**.
2. Le fallback Claude → Codex repart d’un worktree propre même si Claude a laissé des fichiers modifiés avant une erreur récupérable — **validé**.
3. Un échec du reset empêche le fallback et expose un code borné/redacted — **validé**.
4. Les fichiers d’une tentative primaire rejetée ne remontent pas dans le résultat final après fallback — **validé**.
5. Codex conserve son garde `worktree_not_clean` — **validé, code inchangé**.
6. Sans repairer, un budget demandé de 1 est projeté/effectif à 0 et ne produit plus `repairer_unavailable` — **validé**.
7. `audit:strict` est vert ; validation complète et CI GitHub — **gate de PR**.
8. Burn-in réel Codex Astra abonnement — **validé par probe VPS borné avant implémentation**.
