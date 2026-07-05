# Audit post rag-index

## État actuel

Loop Engine dispose d'un index RAG local reconstructible.

## Commandes

- `pnpm run rag-index`
- `pnpm run validate`

## Fichier généré

- `.loop-engine/rag-index.json`

Ce fichier est ignoré par Git.

## Contenu indexé

Sources autorisées :

- `README.md`
- `CHANGELOG.md`
- `CLAUDE.md`
- `docs/architecture/`
- `docs/audits/`
- `docs/roadmap/`
- `docs/integrations/`
- `docs/releases/`

## Forces

- Zéro dépendance.
- Zéro IA automatique.
- Zéro service externe.
- Index reconstructible.
- Test de génération présent.
- Sources traçables par chemin.

## Limites

- Pas encore de recherche.
- Pas encore de découpage par sections.
- Pas encore de score avancé.
- Pas encore de citations ligne/section.
- Pas encore d'embeddings.

## Recommandation

Ajouter ensuite une commande `rag-search`.

V1 recommandée :

- recherche substring ;
- scoring par nombre d'occurrences ;
- affichage des meilleurs documents ;
- aucune IA ;
- aucune dépendance.
