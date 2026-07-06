# Audit post V2.0 RAG JSON

## État actuel

Loop Engine dispose maintenant de :

- `rag-index`
- `rag-search`
- `rag-search --json`
- snippets
- index section-level
- tests RAG
- intégration `json-check`
- validation complète via `pnpm run validate`

## Forces

- JSON public compact.
- Recherche locale read-only.
- Sources traçables.
- Résultats exploitables par n8n, OpenClaw ou dashboard.
- Aucun embedding.
- Aucun service externe.
- Aucune IA automatique.

## Limites

- Scoring encore simple.
- Pas de recherche multi-termes.
- Pas de filtre par dossier.
- Pas de limite configurable.
- Pas de commande de handoff humain dédiée.
- Pas de citations par ligne.

## Options V2.1

### Option A — limite configurable

Ajouter `--limit <n>` à `rag-search`.

### Option B — filtre par dossier

Ajouter `--path docs/architecture`.

### Option C — recherche multi-termes

Scorer plusieurs mots au lieu d'une simple substring.

### Option D — handoff assistant humain

Créer une sortie combinant `next`, `prompt` et résultats RAG.

## Recommandation

Commencer par **Option A — limite configurable**.

Raison :

- petit changement ;
- utile en CLI et JSON ;
- sans dépendance ;
- facile à tester ;
- améliore directement les consommateurs externes.
