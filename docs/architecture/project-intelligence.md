# Project Intelligence Engine

## Statut

Architecture V1 cible.

## Objectif

Le Project Intelligence Engine est le coeur de Loop Engine.

Son rôle est de construire une représentation cohérente d un projet local.

Toutes les commandes doivent consommer cette représentation plutôt que relire directement Git, la configuration ou la documentation.

## Philosophie

Loop Engine distingue les données déclaratives venant de projects.yaml et les données calculées obtenues en analysant le projet local.

Le moteur fusionne ces informations dans un snapshot unique.

## ProjectSnapshot

Champs prévus :

- project : name, type, path
- git : branch, clean
- docs : required, missing
- validation : commands, configured
- roadmap : available, lastLot, nextLot
- health : good, warning, error

## Principes

- une seule source de vérité par information
- aucune duplication de logique
- séparation stricte entre collecte et présentation
- aucune dépendance à un fournisseur IA
- aucune consommation de tokens par défaut
- architecture extensible

---

## Roadmap candidates

Le moteur peut détecter des candidats simples dans les fichiers déclarés dans `roadmap`.

La détection V1 est volontairement naïve. Elle repère les lignes contenant :

- `- [ ]`
- `TODO`
- `À faire`
- `A faire`
- `Prochain`
- `prochain`

Chaque candidat est classé en trois niveaux :

- `safe` : candidat a priori compatible avec un micro-lot.
- `warning` : candidat sensible qui nécessite une revue humaine renforcée.
- `blocked` : candidat trop risqué pour être démarré directement.

La classification V1 repose sur des mots-clés.

Candidats `blocked` :

- `production finale`
- `prod`
- `paiement`
- `migration`
- `delete`
- `supprimer`

Candidats `warning` :

- `déploiement`
- `deploiement`
- `VPS`
- `DNS`
- `bascule`
- `sécurité`
- `securite`

La commande `next` doit préférer un candidat `safe`, puis `warning`, puis `blocked`.

Si seul un candidat `blocked` est disponible, Loop Engine ne doit pas le présenter comme prochain micro-lot sûr. Il doit inviter à ouvrir la roadmap et choisir un prérequis plus petit et réversible.

Cette logique reste déterministe et ne consomme aucun token.
