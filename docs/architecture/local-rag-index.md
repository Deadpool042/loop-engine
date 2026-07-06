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


## Commande V1

La commande disponible est :

- `pnpm exec tsx src/cli.ts rag-index`

Elle reconstruit :

- `.loop-engine/rag-index.json`

Le dossier `.loop-engine/` est local, reconstructible et ignoré par Git.


## Recherche V1

La commande disponible est :

- `pnpm run rag-search -- <query>`

Elle lit :

- `.loop-engine/rag-index.json`

La recherche V1 est déterministe :

- recherche substring ;
- score par nombre d'occurrences ;
- bonus sur le titre et le chemin ;
- aucun embedding ;
- aucun appel IA.


## Snippets de recherche

`rag-search` affiche un court extrait pour chaque résultat.

Règles V1 :

- premier match insensible à la casse ;
- environ 80 caractères avant/après ;
- espaces et retours ligne normalisés ;
- préfixe/suffixe `...` si l'extrait est tronqué ;
- aucun appel IA ;
- aucune dépendance.


## Évolution section-level

La prochaine évolution documentée est l'indexation par sections Markdown :

- `docs/architecture/local-rag-sections.md`

Objectif :

- améliorer la précision ;
- garder l'index local ;
- rester sans embedding ;
- rester sans dépendance externe.


## Sortie JSON de recherche

`rag-search` expose une sortie JSON publique :

- `pnpm exec tsx src/cli.ts rag-search <query> --json`

Le payload contient :

- `schemaVersion`
- `query`
- `results`

Chaque résultat contient :

- `path`
- `title`
- `sectionTitle`
- `headingLevel`
- `score`
- `snippet`

Cette sortie est incluse dans `json-check`.


## Limite de résultats

`rag-search` supporte une limite de résultats :

- `pnpm run rag-search -- <query> --limit 2`
- `pnpm exec tsx src/cli.ts rag-search <query> --limit 2 --json`

Règles :

- la limite doit être un entier positif ;
- si aucune limite valide n'est fournie, la limite par défaut est `5` ;
- la limite s'applique aux sorties humaines et JSON.

