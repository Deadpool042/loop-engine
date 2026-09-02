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
- workspace : mode, dependencies, materialized, expectedAbsent, repository
- git : branch, clean
- docs : required, missing
- validation : commands, configured
- planning : mode déclaré ou non déclaré, roadmaps configurées/détectées, recommandation déterministe
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

## Workspace materialization

Le registre `projects.yaml` décrit aussi la présence attendue d'un projet sur le worker courant. Cette information ne change ni la priorité produit ni la source de vérité GitHub ; elle indique seulement comment le checkout local est géré.

Modes supportés :

- `permanent` : le checkout est attendu en permanence sur le worker ;
- `source_only` : le checkout Git est attendu, sans installation permanente des dépendances ;
- `on_demand` : l'absence locale est normale et le checkout peut être matérialisé lorsque le projet devient actif ;
- `none` : aucun checkout n'est requis sur ce worker.

`workspace.dependencies` vaut `none`, `on_demand` ou `production` et reste une politique déclarative distincte de la matérialisation du source.

La commande `loop workspace materialize <project>` n'accepte aucune URL arbitraire. Elle utilise uniquement le slug GitHub `repository` déclaré dans le registre, confine la destination à un enfant direct du workspace, clone uniquement `main` si le checkout est absent et n'effectue qu'un fetch + merge `--ff-only` lorsqu'il existe déjà. Un worktree sale, une branche différente de `main`, un origin inattendu ou un espace disque inférieur à `workspace_policy.min_free_disk_gib` font échouer l'opération sans fallback destructif.

Un projet absent en mode `on_demand` ou `none` expose `expectedAbsent: true` et ne dégrade pas la santé du portefeuille. À l'inverse, l'absence d'un projet `permanent` ou `source_only` reste visible comme anomalie à corriger.

---

## Planning state

La sémantique de planning appartient à Loop Engine et complète, sans la remplacer, l'analyse des candidats.

Un projet peut déclarer `planning.mode` : `roadmap`, `maintenance`, `deferred` ou `external`. Sans déclaration, une configuration `roadmap` existante conserve le mode effectif `roadmap`; l'absence des deux reste explicitement non déclarée, sans intention inférée.

La commande `loop roadmap status <project>` inspecte uniquement le root du projet déjà déclaré. Elle relève les fichiers présents à quatre emplacements conventionnels fixes et distingue explicitement les chemins configurés des chemins conventionnels supplémentaires détectés. Elle ne parcourt pas récursivement les Markdown, ne lit aucun contenu pour qualifier un fichier, ne crée rien et ne modifie jamais l'admissibilité d'un candidat.

Une recommandation de planning est structurelle et déterministe. Elle prime donc sur l'absence ou la présence d'un candidat : maintenance, deferred, external et roadmap découverte mais non raccordée ne déclenchent aucun travail.

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
