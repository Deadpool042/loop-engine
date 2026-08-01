# Architecture de Loop Platform et Loop Engine

## Métadonnées

- Type : Normatif
- Statut : Actif
- Portée : Navigation et gouvernance de la documentation d'architecture
- Prédécesseur : Aucun
- Successeur : Aucun
- Décision associée : Aucun

## Rôle de cet index

Ce document est le point d'entrée canonique de `docs/architecture/`. Il oriente
la lecture vers les documents de référence sans en recopier les contrats
évolutifs.

Les règles de cycle de vie et de métadonnées s'appliquent aux nouveaux
documents créés à partir de V18.0a. Elles ne reclassent, ne déplacent ni ne
réécrivent les documents existants.

## Ordre de lecture

### 1. Objectif et fondations

1. [Objectif final de Loop Engine](final-objective.md)
2. [Vision de Loop Platform](vision.md)
3. [Principes architecturaux](principles.md)
4. [Glossaire](glossary.md)
5. [Cartographie des plateformes](platform-map.md)
6. [Règles de dépendance](dependency-rules.md)
7. [Gouvernance de l'architecture](governance.md)
8. [Cycle de vie des documents](document-lifecycle.md)

### 2. Contrats de capacité

Lire ensuite le contrat courant correspondant à la capacité étudiée. Les points
d'entrée existants comprennent notamment :

- [Architecture des commandes](commands.md) et
  [contrat d'assemblage applicatif](application-assembly-contract.md) ;
- [Intelligence de projet](project-intelligence.md) et
  [Roadmap Reader](roadmap-reader.md) ;
- [Audit Engine](audit-engine.md) ;
- [LoopRunner](autonomous-loop-runner.md) et son
  [cycle execute/validate/repair](looprunner-execute-validation-repair.md) ;
- [Architecture d'exécution](execution-architecture-rfc.md) ;
- [plateforme durable d'exécution](durable-execution-control-plane.md).

Les documents créés à partir de V18.0a indiquent ce rôle dans leurs métadonnées.
Les documents existants ne sont pas migrés par cet index et conservent leurs
indications de statut propres.

### 3. Décisions et évolutions

- Les [ADRs](adr/) expliquent les décisions architecturales durables.
- Les [RFCs](rfc/) regroupent les futures RFCs suivant la convention V18.0a.
- Les RFCs et documents d'évolution antérieurs peuvent demeurer au niveau
  racine ; ils ne sont pas déplacés par cette gouvernance.

Consulter d'abord une RFC lorsqu'une évolution est proposée, puis l'ADR associé
si une décision durable a été prise, et enfin le contrat courant de la capacité.

### 4. Historique et livraison

Les documents versionnés, les consolidations et les documents de lot servent de
contexte et de preuve. Ils ne remplacent pas un contrat courant actif.

Pour distinguer ces documents et suivre leurs relations, appliquer le
[cycle de vie documentaire](document-lifecycle.md#relation-entre-courant-historique-et-livraison).

## Convention pour les nouveaux documents

Tout nouveau document d'architecture suit la convention de métadonnées définie
dans le [cycle de vie documentaire](document-lifecycle.md).

Les types autorisés sont : `Normatif`, `ADR`, `RFC`, `Contrat courant`,
`Historique` et `Delivery Record`. Les statuts autorisés et les règles de
succession dépendent du type ; ils sont définis dans ce même document.

## Hiérarchie documentaire

En cas de question sur une capacité, lire dans cet ordre :

1. le document normatif applicable ;
2. le contrat courant actif ;
3. l'ADR ou la RFC qui explique la décision ;
4. les documents historiques et Delivery Records comme contexte ou preuve.

La documentation ne remplace pas le code, les contrats publics, les audits ou
la validation continue. En cas de divergence, elle doit être résolue
explicitement selon les règles de [gouvernance](governance.md).
