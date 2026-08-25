TEMPORARY WORKING ROADMAP — ce document doit être supprimé avant la fin de V35 et n’est pas une source normative.

# V35 — Addressable Run History Evidence Lookup

## Objectif

Corriger l’adressabilité des preuves Run History : un `runId` explicite doit pouvoir être retrouvé indépendamment de la limite de pagination des rapports récents, sans augmenter `MAX_RUN_HISTORY_LIMIT` et sans charger le journal complet en mémoire.

## Invariants

- Run History reste append-only et project-scoped.
- Les listes restent bornées à `MAX_RUN_HISTORY_LIMIT`.
- Un lookup exact ne fabrique aucune donnée et retourne uniquement une entrée `LoopRunResult` réellement persistée.
- Les lignes corrompues restent ignorées de façon déterministe.
- Aucun nouveau stockage, index secondaire ou base de données.
- Aucun scan global multi-projets.
- Aucun effet sur policy, sélection, provider ou publication.
- La review candidate V34 doit réutiliser ce lookup au lieu d’un report limité à 100 entrées.

## Audit

- Confirmer que la limite de 100 appartient au report et non à la rétention.
- Identifier le parseur/validateur Run History existant à réutiliser.
- Qualifier la stratégie de lecture exacte la plus petite et bornée en mémoire.

## Decision

GO si une lecture séquentielle/streamée d’un seul journal peut retrouver un `runId` exact avec mémoire bornée et validation existante, sans nouvelle persistence.

## Implementation

- Ajouter une primitive exacte spécialisée de lookup Run History.
- Réutiliser la validation de `LoopRunResult` existante ; ne pas créer un second schéma.
- Remplacer dans V34 le lookup via `generateRunHistoryReport(..., { limit: 100 })`.
- Ajouter couverture >100 entrées, ligne corrompue, duplicate runId et absence.
- Mettre à jour la documentation durable.

## Validation

- tests ciblés Run History + V34
- tests roadmap
- typecheck
- json-check
- audit:strict
- audit:profiles
- suite CI

## Cleanup

Supprimer ce fichier avant la PR.