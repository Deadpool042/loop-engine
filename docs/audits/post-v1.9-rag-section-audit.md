# Audit post V1.9 RAG section-level

## État actuel

Loop Engine dispose maintenant de :

- index RAG local ;
- recherche locale ;
- snippets ;
- indexation par sections Markdown ;
- affichage des titres de section ;
- tests associés ;
- zéro embedding ;
- zéro IA automatique.

## Forces

- Résultats plus précis que l'index fichier entier.
- Sources plus lisibles grâce aux sections.
- Index toujours reconstructible.
- Aucune dépendance externe.
- Compatible avec les garde-fous read-only.

## Limites

- Pas encore de citation ligne.
- Pas encore de commande JSON pour `rag-search`.
- Pas encore de recherche multi-termes pondérée.
- Pas encore de filtre par dossier.
- Pas encore de handoff dédié vers assistant humain.

## Options V2.0

### Option A — `rag-search --json`

Exposer les résultats RAG en JSON pour n8n, OpenClaw ou dashboard.

### Option B — citations section-level

Afficher des références plus précises dans les résultats.

### Option C — recherche multi-termes

Améliorer le scoring sans embeddings.

### Option D — handoff assistant humain

Créer une sortie dédiée qui prépare un contexte exploitable par Claude/Codex sans action automatique.

## Recommandation

Commencer par **Option A — `rag-search --json`**.

Raison :

- cohérent avec les contrats JSON existants ;
- utile pour n8n/OpenClaw/dashboard ;
- reste read-only ;
- testable via `json-check` ou tests dédiés ;
- ne nécessite aucune dépendance.

