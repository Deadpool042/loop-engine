# Local RAG Index

## Objectif

Définir un futur index local pour rechercher dans la documentation Loop Engine.

L'index doit rester reconstructible, read-only et non critique.

## Sources V1

Sources autorisées :

- `README.md`
- `CHANGELOG.md`
- `CLAUDE.md`
- `docs/architecture/`
- `docs/audits/`
- `docs/roadmap/`
- `docs/integrations/`
- `docs/releases/`

## Format d'index recommandé

Un index JSON local peut contenir :

- `schemaVersion`
- `generatedAt`
- `sources`
- `documents`

Chaque document contient :

- `id`
- `path`
- `title`
- `content`
- `contentHash`

## Exclusions

Ne jamais indexer :

- secrets
- `.env*`
- `node_modules/`
- artefacts de build
- dumps
- données personnelles

## Reconstruction

L'index doit pouvoir être supprimé et reconstruit.

Aucune donnée métier importante ne doit exister uniquement dans l'index.

## Garde-fous

- Pas d'appel IA automatique.
- Pas d'embedding obligatoire en V1.
- Pas de service externe obligatoire.
- Pas d'écriture dans les projets inspectés.
- Sources toujours traçables.
