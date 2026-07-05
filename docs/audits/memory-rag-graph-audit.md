# Audit Memory / RAG / Graph

## Objectif

Évaluer l'intérêt d'ajouter une couche mémoire à Loop Engine sans casser sa philosophie déterministe.

## Options étudiées

### RAG simple

Usage potentiel :

- rechercher dans README, CHANGELOG, docs architecture, audits ;
- retrouver un lot passé ;
- aider à préparer un prompt humain.

Avantage : simple, local, peu risqué.

Risque : qualité dépendante du découpage et de l'index.

### MemPalace

Usage potentiel :

- mémoire locale long terme ;
- conservation des décisions ;
- historique des sessions ;
- rappel de contexte sans cloud.

Avantage : local-first, orienté mémoire.

Risque : ajout d'un système externe encore jeune.

### Graphiti

Usage potentiel :

- graphe temporel des projets ;
- relations entre lots, décisions, tags, roadmaps ;
- suivi des faits qui changent dans le temps.

Avantage : modèle riche pour agents et contexte évolutif.

Risque : complexité forte, dépendances potentielles, risque d'agentification prématurée.

## Recommandation

Ne pas intégrer MemPalace ou Graphiti directement dans Loop Engine V1.

Commencer par un RAG local minimal en lecture seule, ou par une documentation de handoff vers un outil externe.

## Règles

- aucune IA automatique ;
- aucune mémoire auto-écrite sans confirmation ;
- aucune modification de projet ;
- lecture seule par défaut ;
- sources citées et traçables ;
- possibilité de supprimer/reconstruire l'index.

## Premier micro-lot recommandé

Créer une spécification `docs/architecture/memory-layer.md` décrivant :

- sources indexables ;
- données exclues ;
- mode lecture seule ;
- stratégie de reconstruction ;
- garde-fous.
