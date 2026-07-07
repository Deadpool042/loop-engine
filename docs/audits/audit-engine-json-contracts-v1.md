# Audit Engine — JSON Contracts V1

## Objectif

Analyser les contrats JSON publics de Loop Engine afin d'en déduire des règles automatisables.

## Constats mesurés

- `schemaVersion` apparaît dans 10 fichiers de commandes.
- `JSON.stringify` apparaît dans 9 fichiers de commandes.
- `json-check` couvre 7 commandes JSON publiques.

Commandes JSON publiques couvertes :

- `summary --json`
- `context <project> --json`
- `next <project> --json`
- `prompt <project> --json`
- `review <project> --json`
- `handoff <project> --json`
- `rag-search <query> --json`

## Points forts

- Toutes les sorties JSON publiques exposent `schemaVersion`.
- `json-check` est intégré à `pnpm run validate`.
- `json-check` vérifie maintenant des champs structurants.
- Les sorties JSON sont compactes et parsables.
- Les erreurs projet sont normalisées pour `missing_project` et `unknown_project`.

## Fragilités

### Payloads dupliqués

Les commandes reconstruisent encore manuellement une partie des payloads publics.

Le bloc `roadmap` est répété dans plusieurs commandes.

Risque :

- divergence de contrat entre commandes ;
- oubli d'un champ lors d'une évolution ;
- duplication de maintenance.

### Erreurs partiellement normalisées

Les erreurs projet sont normalisées.

Mais les erreurs propres à certaines commandes restent spécifiques.

Exemple :

- `rag-search` gère `missing_query`
- `rag-search` gère `missing_index`

À surveiller avant d'ajouter d'autres commandes JSON.

## Refactoring recommandé

Créer un helper de payload public partagé.

Nom possible :

- `buildPublicProjectPayload`
- `buildSnapshotJsonPayload`

Objectif :

- centraliser `schemaVersion`
- centraliser `project`
- centraliser `git`
- centraliser `roadmap`
- centraliser `validation`

Chaque commande ajouterait seulement ses champs spécifiques :

- `docs`
- `health`
- `instructions`
- `results`
- `diffStat`

## Règles candidates Audit Engine

### JSON-001

Toute sortie `--json` doit exposer `schemaVersion`.

### JSON-002

Toute sortie `--json` doit être parsable sans texte avant ou après.

### JSON-003

Les erreurs en mode `--json` doivent être sérialisées en JSON.

### JSON-004

Les commandes projet ne doivent pas reconstruire manuellement le bloc `roadmap`.

### JSON-005

`json-check` doit couvrir toute nouvelle commande publique `--json`.

### JSON-006

Les sorties JSON ne doivent pas contenir d'ANSI, emoji ou texte décoratif.

## Priorité

Le prochain refactoring à fort ROI est :

- factoriser les payloads JSON publics.

Ce refactoring est plus prioritaire que la factorisation des renderers terminal.
