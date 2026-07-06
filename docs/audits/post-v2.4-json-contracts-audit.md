# Audit post V2.4 JSON contracts

## État actuel

Loop Engine dispose de contrats JSON publics documentés.

Commandes concernées :

- `summary --json`
- `context <project> --json`
- `next <project> --json`
- `prompt <project> --json`
- `review <project> --json`
- `rag-search <query> --json`
- `handoff <project> --json`

## Forces

- `schemaVersion` présent.
- `json-check` intégré à `validate`.
- JSON compact.
- Sorties parsables.
- Contrats documentés.

## Limites

- Erreurs JSON encore hétérogènes.
- `json-check` vérifie surtout la parsabilité.
- Peu de validation structurelle par commande.
- Pas de schéma formel.
- Pas de snapshot de contrat.

## Options V2.5

### Option A — erreurs JSON normalisées

Définir un format commun :

- `schemaVersion`
- `error`
- `message`

### Option B — validation structurelle dans json-check

Vérifier certains champs attendus par commande.

### Option C — snapshots de contrat

Stocker des exemples JSON publics.

## Recommandation

Commencer par **Option B — validation structurelle dans json-check**.

Raison :

- renforce le garde-fou existant ;
- aucun nouveau format à inventer ;
- petit lot ;
- utile immédiatement pour éviter les régressions.
