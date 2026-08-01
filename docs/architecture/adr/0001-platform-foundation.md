# ADR-0001 — Platform Foundation

## Statut

Accepté.

## Contexte

Les premières versions de Loop Engine ont permis de construire un moteur
déterministe, une plateforme d'audit et une chaîne de validation robuste.

L'évolution du projet nécessite désormais une architecture permettant
d'ajouter de nouvelles capacités d'ingénierie sans mélanger les
responsabilités.

## Décision

Le projet est structuré autour de plateformes possédant chacune une
responsabilité unique.

Les plateformes actuellement définies sont :

- Runtime Platform ;
- Audit Platform ;
- Automation Platform ;
- CI Platform.

Chaque plateforme :

- expose une API publique ;
- possède ses propres responsabilités ;
- cache ses implémentations internes ;
- évolue indépendamment des autres dans le respect des règles de dépendance.

Les nouvelles capacités sont rattachées à une plateforme existante ou
justifient explicitement la création d'une nouvelle plateforme.

## Conséquences

L'architecture est organisée autour de responsabilités clairement identifiées.

Les dépendances deviennent explicites.

Les évolutions futures peuvent être réalisées sans remettre en cause
l'organisation générale du projet.

Les audits d'architecture peuvent vérifier le respect de ces frontières.
