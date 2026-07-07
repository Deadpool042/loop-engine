# Audit Engine — Cartographie V1

## Objectif

Établir une cartographie mesurée de Loop Engine avant de concevoir le futur moteur d'audit.

## Métriques initiales

- 85 fichiers au total.
- 29 fichiers TypeScript.
- 37 fichiers Markdown.

Répartition principale :

- `docs/` : 40 fichiers.
- `src/` : 28 fichiers.
- `tests/` : 9 fichiers.

## Constat

La documentation est une composante majeure du projet.

Le projet reste compact :

- aucun fichier de production très volumineux ;
- structure lisible ;
- séparation claire entre `src/`, `tests/` et `docs/`.

## Architecture observée

Architecture dominante :

CLI
→ commands
→ intelligence
→ core

`ui/` agit comme façade de sortie.

## Noyau architectural

Le centre fonctionnel du projet est :

- `buildProjectSnapshot()`

Les commandes publiques devraient rester des vues sur le snapshot.

## Première règle candidate

### ARCH-001

Une commande publique ne doit pas accéder directement à Git, aux docs ou à la roadmap.

Elle doit consommer `ProjectSnapshot`.

## Suite

Prochain livrable :

- analyse des duplications ;
- distinction entre duplication de logique, rendu, JSON et algorithmes.
