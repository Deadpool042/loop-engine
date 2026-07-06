# JSON Contracts

## Objectif

Définir les contrats publics des commandes `--json`.

Les sorties JSON constituent une API stable pour :

- scripts ;
- CI ;
- n8n ;
- dashboards ;
- assistants IA supervisés.

## Commandes concernées

- summary
- context
- next
- prompt
- review
- rag-search
- handoff

## Règles générales

Chaque sortie JSON :

- est un JSON valide ;
- ne contient aucun texte avant ou après ;
- est déterministe ;
- contient toujours `schemaVersion`.

## Compatibilité

Les évolutions compatibles :

- ajout de champs optionnels ;
- ajout de nouvelles commandes.

Les évolutions incompatibles :

- suppression de champs publics ;
- changement de type ;
- changement de structure.

Dans ces cas :

- incrémenter `schemaVersion`.

## Erreurs

Les erreurs doivent être sérialisables.

Exemple :

{
  "schemaVersion": 1,
  "error": "missing_project"
}

## Interdictions

Les sorties JSON ne doivent jamais contenir :

- couleurs ANSI ;
- emojis ;
- texte décoratif ;
- prompts interactifs.

## Validation

Toutes les commandes JSON doivent être couvertes par :

pnpm exec tsx src/cli.ts json-check


## Validation structurelle

`json-check` ne vérifie pas seulement que les sorties sont parsables.

Il vérifie aussi des champs structurants par commande :

- `summary` : `projects`
- `context` : `project`, `docs`
- `next` : `project`, `roadmap`
- `prompt` : `project`, `instructions`
- `review` : `project`, `diffStat`
- `handoff` : `project`, `instructions`
- `rag-search` : `query`, `results`

Cette validation reste volontairement légère.

Elle sert à détecter les régressions de contrat sans introduire de schéma formel.

