# Audit rag-search path filter

## Objectif

Évaluer l'ajout d'un filtre de chemin à `rag-search`.

## Besoin

Permettre de limiter la recherche à une zone documentaire.

Exemples :

- `docs/architecture`
- `docs/audits`
- `docs/integrations`

## Option recommandée

Ajouter :

- `--path <prefix>`

Exemples :

- `pnpm run rag-search -- roadmap --path docs/architecture`
- `pnpm exec tsx src/cli.ts rag-search roadmap --path docs/architecture --json`

## Règles

- le filtre s'applique avant le scoring ;
- le filtre est un préfixe de chemin ;
- aucun accès hors index ;
- aucune lecture fichier supplémentaire ;
- sortie humaine et JSON cohérentes.

## Garde-fous

- read-only ;
- zéro IA ;
- zéro dépendance ;
- index reconstructible ;
- résultats traçables.

## Premier micro-lot recommandé

Ajouter `pathPrefix` à `runRagSearch`.
