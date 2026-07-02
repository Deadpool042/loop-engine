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
