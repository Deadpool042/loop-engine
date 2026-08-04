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

---

## GUI Cockpit (V1)

Vocabulaire introduit par le cadrage de l'interface graphique de pilotage
(voir `gui-cockpit.md` et [ADR-0006](adr/0006-gui-cockpit-external-json-consumer.md)).

- **GUI Cockpit** : application desktop locale qui pilote visuellement
  Loop Engine. C'est un consommateur JSON externe au moteur, au même
  titre qu'OpenClaw ou n8n — jamais un module interne.
- **Section** : bloc repliable de l'écran Détail projet correspondant à
  une commande CLI (`status`, `next`, `context`, `prompt`, `review`,
  `plan`). Une section a un cycle de vie propre : repliée → en
  chargement → chargée/en cache → en erreur.
- **Chargement eager** : chargement automatique d'une section dès
  l'ouverture du projet (`status`, `next`).
- **Chargement lazy** : chargement d'une section déclenché uniquement au
  premier dépliage par l'opérateur (`context`, `prompt`, `review`,
  `plan`), puis mis en cache pour la session.
- **Opérateur** : persona unique de la GUI Cockpit V1 — l'utilisateur
  solo qui pilote ses propres projets locaux.

Chaque candidat expose aussi une `reason` déterministe expliquant le classement.

Exemples :

- `no sensitive keyword detected`
- `contains "migration"`
- `contains "bascule"`

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
