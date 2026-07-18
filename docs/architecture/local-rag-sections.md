# Local RAG Sections

## Objectif

Améliorer la précision du RAG local en indexant des sections Markdown plutôt que des fichiers entiers.

## Problème

L'index V1.8 indexe un document complet par fichier.

Cela limite la précision :

- scores trop globaux ;
- snippets parfois éloignés du sujet ;
- résultats moins utiles sur les gros fichiers.

## Principe V1.9

Découper les fichiers Markdown par titres :

- `#`
- `##`
- `###`

Chaque section devient un document indexé.

## Structure recommandée

Chaque document section-level contient :

- `id`
- `path`
- `title`
- `sectionTitle`
- `headingLevel`
- `content`
- `contentHash`

## Garde-fous

- zéro IA automatique ;
- zéro embedding ;
- zéro dépendance ;
- index reconstructible ;
- sources traçables ;
- fichiers exclus inchangés.

## Compatibilité

Le fichier généré reste :

- `.loop-engine/rag-index.json`

Le `schemaVersion` devra être incrémenté si la structure change de manière incompatible.

## Implémentation

L'index local RAG indexe désormais les sections Markdown.

Commande :

- `pnpm run rag-index`

Chaque entrée contient :

- `path`
- `title`
- `sectionTitle`
- `headingLevel`
- `content`
- `contentHash`

La recherche affiche aussi le titre de section via `rag-search`.
